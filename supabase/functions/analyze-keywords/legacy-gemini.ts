/*
// supabase/functions/analyze-keywords/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { encode as base64UrlEncodeBytes } from "https://deno.land/std@0.177.0/encoding/base64url.ts";
import { decode as base64Decode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// Placeholder for types that would be shared or defined more robustly
interface KeywordAnalysisRequest {
    resumeText: string;
    jobDescriptionText: string;
}

interface KeywordOccurrence {
    keyword: string;
    resumeFrequency?: number; // Made optional as it might not be consistently provided
    jdFrequency?: number;     // Made optional
}

interface KeywordAnalysisResponse {
    extractedJdKeywords: string[];
    extractedResumeKeywords: string[];
    matchedKeywords: KeywordOccurrence[];
    missingKeywords: string[];
    error?: string;
}

// Helper function to generate OAuth 2.0 access token for Vertex AI
async function getVertexAiAccessToken(): Promise<string> {
    const serviceAccountKeyJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY_JSON");
    if (!serviceAccountKeyJson) {
        console.error("DEBUG: GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set.");
        throw new Error("Service account key JSON is not configured.");
    }

    let serviceAccountCredentials;
    try {
        serviceAccountCredentials = JSON.parse(serviceAccountKeyJson);
    } catch (e) {
        const err = e as Error;
        console.error("DEBUG: Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY_JSON:", err.message);
        throw new Error(`Invalid service account key JSON format: ${err.message}`);
    }

    const clientEmail = serviceAccountCredentials.client_email;
    const privateKeyPem = serviceAccountCredentials.private_key;

    if (!clientEmail || !privateKeyPem) {
        console.error("DEBUG: client_email or private_key is missing from service account JSON.");
        throw new Error("Malformed service account key JSON: client_email or private_key missing.");
    }
    console.log(`DEBUG: Using client_email: ${clientEmail}`);
    console.log(`DEBUG: private_key is present (not logging value for security).`);

    // Prepare private key for import
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    let privateKeyPkcs8Der: Uint8Array;
    try {
        const privateKeyBase64 = privateKeyPem
            .replace(pemHeader, "")
            .replace(pemFooter, "")
            .replace(/\s/g, ""); // Remove all whitespace, including newlines
        privateKeyPkcs8Der = base64Decode(privateKeyBase64);
    } catch (e) {
        const err = e as Error;
        console.error("DEBUG: Failed to decode private key:", err.message);
        throw new Error(`Failed to decode private key from PEM format: ${err.message}`);
    }

    let importedPrivateKey: CryptoKey;
    try {
        importedPrivateKey = await crypto.subtle.importKey(
            "pkcs8",
            privateKeyPkcs8Der,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false, // not extractable
            ["sign"]
        );
    } catch (e) {
        const err = e as Error;
        console.error("DEBUG: Failed to import private key:", err.message, err.stack);
        throw new Error(`Error importing private key: ${err.message}`);
    }

    const jwtHeader = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3500; // Expires in just under 1 hour (3600s is max for Google)

    const jwtPayload = {
        iss: clientEmail,
        sub: clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: exp,
        scope: "https://www.googleapis.com/auth/cloud-platform", // Common scope for GCP services
    };

    const textEncoder = new TextEncoder();
    const encodedHeader = base64UrlEncodeBytes(textEncoder.encode(JSON.stringify(jwtHeader)));
    const encodedPayload = base64UrlEncodeBytes(textEncoder.encode(JSON.stringify(jwtPayload)));

    const dataToSign = textEncoder.encode(`${encodedHeader}.${encodedPayload}`);

    let signature: ArrayBuffer;
    try {
        signature = await crypto.subtle.sign(
            { name: "RSASSA-PKCS1-v1_5" }, // Algorithm object for sign
            importedPrivateKey,
            dataToSign
        );
    } catch (e) {
        const err = e as Error;
        console.error("DEBUG: Failed to sign JWT:", err.message, err.stack);
        throw new Error(`Error signing JWT: ${err.message}`);
    }

    const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
    const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }).toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("DEBUG: Failed to exchange JWT for access token:", tokenResponse.status, errorText);
        throw new Error(`OAuth token exchange failed: ${tokenResponse.status} ${errorText.substring(0, 200)}`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
        console.error("DEBUG: access_token not found in OAuth response:", JSON.stringify(tokenData).substring(0, 200));
        throw new Error("access_token not found in OAuth response.");
    }
    // console.log("DEBUG: Successfully obtained Vertex AI access token.");
    return tokenData.access_token;
}

// --- Vertex AI API Integration ---

// Try different model versions in order of preference
const VERTEX_AI_MODELS = [
    'gemini-1.5-pro',               // Latest stable model
    'gemini-1.5-flash',             // Faster model
    'gemini-pro',                   // Standard model name
    'gemini-1.0-pro',               // Alternative format
    'gemini-1.0-pro-001',           // Specific version
    'gemini-pro-vision',            // Vision model (can handle text too)
    'text-bison@001'                // Fallback to older model if Gemini is not available
];
let VERTEX_AI_MODEL_ID = VERTEX_AI_MODELS[0]; // Start with the first model
const GCP_PROJECT_ID = 'ats-friendly-resume-builder'; // As per provided URL
const PRIMARY_GCP_LOCATION = 'europe-west1';         // Primary location
const FALLBACK_GCP_LOCATION = 'us-central1';         // Fallback location if primary fails

async function performNlpAnalysis(
    resumeText: string,
    jobDescriptionText: string
): Promise<KeywordAnalysisResponse> {
    // Try with the primary location first
    let currentLocation = PRIMARY_GCP_LOCATION;
    let modelIndex = 0;
    let apiUrl = '';
    let modelAttempts = 0; // Counter for tracking attempts

    // We'll try different models and locations in a loop
    VERTEX_AI_MODEL_ID = VERTEX_AI_MODELS[modelIndex];

    // Construct the initial Vertex AI endpoint URL
    apiUrl = `https://${currentLocation}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${currentLocation}/publishers/google/models/${VERTEX_AI_MODEL_ID}:generateContent`;

    // Log the API URL for debugging
    console.log(`Starting with API URL: ${apiUrl}`);

    // Create a more concise prompt for the model
    const prompt = VERTEX_AI_MODEL_ID.includes('1.5')
        ? `Extract keywords from this resume and job description. Return JSON only.
Resume: ${resumeText.substring(0, 5000)}
Job Description: ${jobDescriptionText.substring(0, 5000)}
Format: {"extractedJdKeywords":["keyword1"],"extractedResumeKeywords":["keyword1"],"matchedKeywords":[{"keyword":"match1"}],"missingKeywords":["missing1"]}`
        : `
Analyze the provided resume text and job description text.
Your goal is to identify and categorize keywords.

Resume Text:
"""
${resumeText.substring(0, 10000)}
"""

Job Description Text:
"""
${jobDescriptionText.substring(0, 10000)}
"""

Based on the analysis, provide a JSON string with the following structure:
{
  "extractedJdKeywords": ["keyword1 from JD", "keyword2 from JD", ...],
  "extractedResumeKeywords": ["keyword1 from Resume", "keyword2 from Resume", ...],
  "matchedKeywords": [{"keyword": "commonKeyword1"}, {"keyword": "commonKeyword2"}, ...],
  "missingKeywords": ["keyword1 in JD but not Resume", "keyword2 in JD but not Resume", ...]
}

Ensure the output is ONLY the JSON string. Do not include any other text, explanations, or markdown code block syntax.
`;

    try {
        // console.log("DEBUG: Attempting to get Vertex AI access token...");
        const accessToken = await getVertexAiAccessToken();
        // console.log("DEBUG: Access token obtained, proceeding with API call to Vertex AI.");

        // Try different models and locations until one works or we run out of options
        let response = null;
        let lastError = '';

        // We'll try each model in both locations
        for (modelIndex = 0; modelIndex < VERTEX_AI_MODELS.length; modelIndex++) {
            // Try primary location first, then fallback
            for (const location of [PRIMARY_GCP_LOCATION, FALLBACK_GCP_LOCATION]) {
                modelAttempts++;
                VERTEX_AI_MODEL_ID = VERTEX_AI_MODELS[modelIndex];
                currentLocation = location;

                // Update API URL for current model and location
                // Construct the API URL using the current model ID
                apiUrl = `https://${currentLocation}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${currentLocation}/publishers/google/models/${VERTEX_AI_MODEL_ID}:generateContent`;

                console.log(`Attempt ${modelAttempts}: Trying model ${VERTEX_AI_MODEL_ID} in ${currentLocation}`);

                try {
                    // Prepare the request body based on the model
                    let requestBody;

                    if (VERTEX_AI_MODEL_ID.includes('1.5')) {
                        // Format for Gemini 1.5 models - use lower token limit to avoid MAX_TOKENS error
                        requestBody = {
                            contents: [{
                                role: "user",
                                parts: [{ text: prompt }],
                            }],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 1024, // Lower token limit
                                responseMimeType: "application/json",
                                topP: 0.8,
                                topK: 40
                            }
                        };
                    } else {
                        // Format for other Gemini models
                        requestBody = {
                            contents: [{
                                role: "user",
                                parts: [{ text: prompt }],
                            }],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 4096,
                                responseMimeType: "application/json",
                            }
                        };
                    }

                    // Make the API request
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify(requestBody),
                    });

                    // If successful, break out of the loop
                    if (response.ok) {
                        console.log(`Success with model ${VERTEX_AI_MODEL_ID} in ${currentLocation}`);
                        break;
                    }

                    // If not successful, capture the error
                    const errorText = await response.text();
                    lastError = `Status: ${response.status}, Error: ${errorText}`;
                    console.error(`Failed with model ${VERTEX_AI_MODEL_ID} in ${currentLocation}: ${lastError}`);

                } catch (error) {
                    const fetchError = error as Error;
                    lastError = fetchError.message || 'Unknown fetch error';
                    console.error(`Fetch error with model ${VERTEX_AI_MODEL_ID} in ${currentLocation}: ${lastError}`);
                }
            }

            // If we found a working model/location, break out of the outer loop
            if (response && response.ok) {
                break;
            }
        }

        // If we tried all models and locations and none worked
        if (!response || !response.ok) {
            console.error(`All model and location combinations failed. Last error: ${lastError}`);
            return {
                extractedJdKeywords: [],
                extractedResumeKeywords: [],
                matchedKeywords: [],
                missingKeywords: [],
                error: `Failed to find a working AI model. Please ensure the Vertex AI API is enabled in your Google Cloud project and that you have access to the Gemini models. Last error: ${lastError}`,
            };
        }

        // At this point, we know response is ok because we've already handled all error cases in the loop above

        const result = await response.json();
        console.log('Raw API response:', JSON.stringify(result, null, 2));

        let rawJsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        // Check for empty response with MAX_TOKENS finish reason
        if (!rawJsonText && result?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            console.log('Received empty response with MAX_TOKENS finish reason. Generating fallback response.');

            // Generate a fallback response by extracting keywords from the input texts
            const extractKeywords = (text: string): string[] => {
                // Common tech keywords to look for
                const techKeywords = [
                    'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js', 'express', 'next.js',
                    'python', 'django', 'flask', 'java', 'spring', 'c#', '.net', 'php', 'laravel', 'ruby',
                    'rails', 'go', 'rust', 'swift', 'kotlin', 'flutter', 'react native', 'html', 'css',
                    'sass', 'less', 'tailwind', 'bootstrap', 'material ui', 'aws', 'azure', 'gcp', 'docker',
                    'kubernetes', 'ci/cd', 'jenkins', 'git', 'github', 'gitlab', 'bitbucket', 'jira',
                    'agile', 'scrum', 'kanban', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'graphql',
                    'rest', 'api', 'microservices', 'serverless', 'firebase', 'supabase', 'auth0', 'oauth',
                    'jwt', 'testing', 'jest', 'mocha', 'cypress', 'selenium', 'webpack', 'babel', 'eslint',
                    'prettier', 'npm', 'yarn', 'pnpm', 'vite', 'rollup', 'esbuild', 'devops', 'sre',
                    'software engineer', 'frontend', 'backend', 'full stack', 'mobile', 'web', 'cloud',
                    'database', 'data science', 'machine learning', 'ai', 'blockchain', 'security'
                ];

                const lowerText = text.toLowerCase();
                return techKeywords.filter(keyword => lowerText.includes(keyword.toLowerCase()));
            };

            const jdKeywords = extractKeywords(jobDescriptionText);
            const resumeKeywords = extractKeywords(resumeText);

            // Find matched keywords (intersection)
            const matchedKeywords = jdKeywords.filter(keyword => resumeKeywords.includes(keyword))
                .map(keyword => ({ keyword }));

            // Find missing keywords (in JD but not in resume)
            const missingKeywords = jdKeywords.filter(keyword => !resumeKeywords.includes(keyword));

            return {
                extractedJdKeywords: jdKeywords,
                extractedResumeKeywords: resumeKeywords,
                matchedKeywords,
                missingKeywords,
            };
        }

        if (!rawJsonText) {
            console.error('Google AI Gemini API response does not contain expected text part:', JSON.stringify(result, null, 2));
            return {
                extractedJdKeywords: [],
                extractedResumeKeywords: [],
                matchedKeywords: [],
                missingKeywords: [],
                error: 'Invalid response structure from Google AI Gemini API.',
            };
        }

        let jsonToParse = rawJsonText.trim();
        const firstBrace = jsonToParse.indexOf('{');
        const lastBrace = jsonToParse.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonToParse = jsonToParse.substring(firstBrace, lastBrace + 1);
        } else {
            console.warn('Could not find valid JSON structure in Google AI Gemini API response. Raw text:', rawJsonText);
            return {
                extractedJdKeywords: [],
                extractedResumeKeywords: [],
                matchedKeywords: [],
                missingKeywords: [],
                error: 'Malformed JSON response from Google AI Gemini API: No valid JSON structure found.',
            };
        }

        try {
            const parsedAnalysis: KeywordAnalysisResponse = JSON.parse(jsonToParse);
            return {
                extractedJdKeywords: parsedAnalysis.extractedJdKeywords || [],
                extractedResumeKeywords: parsedAnalysis.extractedResumeKeywords || [],
                matchedKeywords: (parsedAnalysis.matchedKeywords || []).map(kw => ({
                    keyword: String(kw.keyword)
                })),
                missingKeywords: parsedAnalysis.missingKeywords || [],
            };
        } catch (parseError) {
            const message = parseError instanceof Error ? parseError.message : String(parseError);
            console.error('Error parsing JSON from Google AI Gemini API:', message, 'Attempted to parse:', jsonToParse, 'Original raw text:', rawJsonText);
            return {
                extractedJdKeywords: [],
                extractedResumeKeywords: [],
                matchedKeywords: [],
                missingKeywords: [],
                error: 'Failed to parse keyword analysis from Google AI Gemini API response.',
            };
        }

    } catch (error) {
        const err = error as Error; // Type assertion for better error handling
        const message = err.message || String(error); // Ensure message is a string

        // Check if it's an auth error from getVertexAiAccessToken
        if (
            message.includes("Service account key JSON") ||
            message.includes("Malformed service account key JSON") ||
            message.includes("Failed to decode private key") ||
            message.includes("Error importing private key") ||
            message.includes("Error signing JWT") ||
            message.includes("OAuth token exchange failed") ||
            message.includes("access_token not found in OAuth response")
        ) {
            console.error('DEBUG: Authentication error for Vertex AI in performNlpAnalysis:', message, err.stack);
            return {
                extractedJdKeywords: [],
                extractedResumeKeywords: [],
                matchedKeywords: [],
                missingKeywords: [],
                error: `Vertex AI Authentication Error: ${message.substring(0, 200)}`, // Keep client error concise
            };
        }

        // This handles errors from the actual fetch to Vertex AI API (e.g. network, non-auth API errors)
        // or other unexpected errors within the try block.
        console.error('DEBUG: Error in performNlpAnalysis (potentially API call or other issue):', message, err.stack);
        return {
            extractedJdKeywords: [],
            extractedResumeKeywords: [],
            matchedKeywords: [],
            missingKeywords: [],
            error: `Failed to perform NLP analysis: ${message.substring(0, 200)}`, // Keep client error concise
        };
    }
}
// --- End of Vertex AI API Integration ---

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Check if the Google service account key is configured
    const serviceAccountKeyJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY_JSON");
    if (!serviceAccountKeyJson) {
        console.error("GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set.");
        return new Response(JSON.stringify({
            error: "Google service account key is not configured. Please set the GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable."
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }

    try {
        if (!req.body) {
            return new Response(JSON.stringify({ error: 'Request body is missing' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }
        const requestBody = (await req.json()) as KeywordAnalysisRequest;
        const { resumeText, jobDescriptionText } = requestBody;

        if (!resumeText || !jobDescriptionText) {
            return new Response(JSON.stringify({ error: 'Missing resumeText or jobDescriptionText' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        const analysisResult = await performNlpAnalysis(resumeText, jobDescriptionText);

        if (analysisResult.error) {
            console.error(`Analysis failed for a request: ${analysisResult.error}`);
            return new Response(JSON.stringify({ error: analysisResult.error }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        return new Response(JSON.stringify(analysisResult), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error('Critical error in Supabase function handler:', message, stack);
        let errorMessage = 'Internal server error';
        if (error instanceof SyntaxError && message.includes("JSON")) {
            errorMessage = "Invalid JSON in request body.";
        } else if (error instanceof Error) {
            errorMessage = message;
        }

        return new Response(JSON.stringify({ error: `Server error: ${errorMessage}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
*/
