// supabase/functions/gemini-proxy/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import { encode as base64UrlEncodeBytes } from "https://deno.land/std@0.177.0/encoding/base64url.ts";
import { decode as base64Decode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

const isProd = Deno.env.get('NODE_ENV') === 'production';
const logDebug = (...args: unknown[]) => {
    if (!isProd) console.log(...args);
};

// If GEMINI_API_KEY is set, use the public Gemini API (simpler setup).
// Otherwise fall back to Vertex AI service account flow.
const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY') || '';
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-pro';
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

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
    return tokenData.access_token;
}

// Available models to try (limited to 3 to avoid excessive API calls)
const VERTEX_AI_MODELS = [
    'gemini-2.5-pro-preview-05-06', // User specified model
    'gemini-1.5-pro',               // Latest stable model
    'gemini-1.5-flash',             // Faster fallback model
];

// Project and location settings
const GCP_PROJECT_ID = 'ats-friendly-resume-builder'; // As per provided URL
const PRIMARY_GCP_LOCATION = 'us-central1';         // Prioritize us-central1 as per user
const FALLBACK_GCP_LOCATION = 'europe-west1';       // Fallback to original primary

serve(async (req: Request) => {
    const requestOrigin = req.headers.get('Origin');
    const originAllowed = isOriginAllowed(requestOrigin);
    if (isProd && requestOrigin && !originAllowed) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const corsHeaders = getCorsHeaders(requestOrigin);

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 405,
        });
    }

    // Authenticate the user
    const authUser = await authenticateUser(req);
    if (!authUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const requestBody = await req.json().catch(() => ({}));

    if (geminiApiKey) {
        try {
            const directResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const responseText = await directResponse.text();
            if (!directResponse.ok) {
                return new Response(JSON.stringify({ error: 'Gemini API error', details: responseText }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: directResponse.status,
                });
            }

            return new Response(responseText, {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        } catch (e) {
            const err = e as Error;
            return new Response(JSON.stringify({ error: 'Gemini API request failed', details: err.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }
    }

    // Check if the Google service account key is configured (Vertex AI fallback)
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
        // Get access token for Vertex AI
        const accessToken = await getVertexAiAccessToken();

        // Try different models and locations until one works
        let response = null;
        let lastError = '';
        let currentLocation = '';
        let currentModel = '';

        // Try each model in both locations
        for (const model of VERTEX_AI_MODELS) {
            for (const location of [PRIMARY_GCP_LOCATION, FALLBACK_GCP_LOCATION]) {
                currentModel = model;
                currentLocation = location;

                // Construct the API URL
                const apiUrl = `https://${currentLocation}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${currentLocation}/publishers/google/models/${currentModel}:generateContent`;

                logDebug(`Trying model ${currentModel} in ${currentLocation}`);

                try {
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
                        logDebug(`Success with model ${currentModel} in ${currentLocation}`);
                        break;
                    }

                    // If not successful, capture the error
                    const errorText = await response.text();
                    lastError = `Status: ${response.status}, Error: ${errorText}`;
                    console.error(`Failed with model ${currentModel} in ${currentLocation}: ${lastError}`);

                } catch (error) {
                    const fetchError = error as Error;
                    lastError = fetchError.message || 'Unknown fetch error';
                    console.error(`Fetch error with model ${currentModel} in ${currentLocation}: ${lastError}`);
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
            return new Response(JSON.stringify({
                error: 'Failed to find a working AI model. Please ensure the Vertex AI API is enabled and that you have access to the Gemini models.'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        // Return the successful response
        const result = await response.json();
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error('Critical error in Supabase function handler:', message, stack);

        return new Response(JSON.stringify({ error: `Server error: ${message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
