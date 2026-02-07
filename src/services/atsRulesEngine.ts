import {
    AtsRule,
    AtsSeverity,
    AtsRuleTier,
    ResumeDataForATS,
} from '../types/atsTypes.js';

const atsRules: AtsRule[] = [
    // Category: File Type & Upload
    {
        id: 'FT01',
        description: 'Detects if the resume is an image file (e.g., .jpg, .png).',
        category: 'File Type',
        severity: AtsSeverity.Critical,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            // This rule is primarily for uploaded files.
            // For in-platform, fileType might be 'in-platform' or undefined.
            return resumeData.fileType === 'image';
        },
        getSuggestion: () =>
            'Your resume appears to be an image file. ATS cannot read text from images. Please use a text-based format like .docx or .pdf (text-based), or build your resume in the platform.',
        getImpactExplanation: () =>
            'Image-based resumes are unreadable by ATS, meaning your application will likely be automatically discarded.',
    },
    {
        id: 'FT02',
        description: 'Detects if a PDF is image-based rather than text-based.',
        category: 'File Type',
        severity: AtsSeverity.Critical,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            return resumeData.fileType === 'pdf' && !!resumeData.isPdfImageBased;
            // isPdfImageBased would be true if rawText is empty or gibberish after PDF parsing
        },
        getSuggestion: () =>
            'Your PDF resume seems to be image-based. ATS cannot extract text from image-based PDFs. Ensure your PDF is saved with selectable text, or use a .docx file.',
        getImpactExplanation: () =>
            'Image-based PDFs are unreadable by most ATS, preventing your resume from being processed.',
    },
    {
        id: 'FT03',
        description: 'Recommends .docx or .txt as preferred file types over others (e.g. .pdf if not perfectly formatted).',
        category: 'File Type',
        severity: AtsSeverity.Medium, // Changed from Low as per document, but PDF is common. Let's make it Medium.
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            // This rule provides advice. It might trigger if fileType is PDF, as DOCX is often safer.
            // For in-platform, this rule might not be relevant or could be adapted.
            return resumeData.fileType === 'pdf'; // Example: Suggest .docx if they uploaded a PDF.
        },
        getSuggestion: () =>
            "While text-based PDFs are often acceptable, .docx files are generally the safest for ATS compatibility. Consider using .docx format if you encounter issues, or build your resume within our platform for optimal results. Avoid .txt if complex formatting is needed.",
        getImpactExplanation: () =>
            'Some ATS can struggle with PDF formatting. .docx is a widely compatible format. .txt loses all formatting.',
    },

    // Category: Formatting - Layout & Structure
    {
        id: 'FL01',
        description: 'Detects use of tables for layout.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.parsedStructure?.usesTablesForLayout,
        getSuggestion: () =>
            'Tables were detected in your resume. ATS may struggle to read content within tables correctly. Consider removing tables and presenting information linearly (e.g., list job duties one after another).',
        getImpactExplanation: () =>
            'Tables can confuse ATS parsers, leading to jumbled or misinterpreted information, significantly harming your application.',
    },
    {
        id: 'FL02',
        description: 'Detects use of multi-column layouts for critical information.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.parsedStructure?.usesMultiColumnLayout,
        getSuggestion: () =>
            'Multi-column layouts were detected. Some ATS parse columns from left to right, then top to bottom, which can mix up your content. A single-column layout is safer for critical information.',
        getImpactExplanation: () =>
            'Multi-column layouts can cause ATS to read information out of order, making your resume incoherent to the system.',
    },
    {
        id: 'FL03',
        description: 'Detects presence of images, charts, or other non-text graphics.',
        category: 'Formatting - Graphics',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.parsedStructure?.containsImagesOrCharts,
        getSuggestion: () =>
            'Images, charts, or other graphics were detected. ATS cannot read these elements and they may disrupt parsing. Remove them or ensure they don’t convey critical information.',
        getImpactExplanation: () =>
            'Graphics are typically ignored by ATS, and any information they contain will be lost. They can also sometimes disrupt the parsing of surrounding text.',
    },
    {
        id: 'FL04',
        description: 'Detects content placed within text boxes.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.parsedStructure?.containsTextBoxes,
        getSuggestion: () =>
            'Content inside text boxes was detected. ATS may overlook or misinterpret text within text boxes. Place all essential text directly on the page.',
        getImpactExplanation: () =>
            'Text boxes are often skipped by ATS, meaning important parts of your resume might not be processed.',
    },
    {
        id: 'FL06',
        description: 'Advises single-column layout for simplicity.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !(resumeData.parsedStructure?.isSingleColumnLayout ?? true) && // Trigger if not single column or unknown
            !!resumeData.parsedStructure?.usesMultiColumnLayout, // More specific: trigger if multi-column is true
        getSuggestion: () =>
            'Your resume appears to use a multi-column layout. For optimal ATS compatibility and readability, a single-column layout is generally recommended.',
        getImpactExplanation: () =>
            'While some modern ATS handle multiple columns, a single-column layout is the safest to ensure proper parsing order.',
    },
    {
        id: 'FL08',
        description: 'Recommends Chronological or Hybrid/Combination formats.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            const format = resumeData.parsedStructure?.resumeFormatType;
            return format === 'functional'; // Specifically flags if functional is detected
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            if (resumeData?.parsedStructure?.resumeFormatType === 'functional') {
                return 'Your resume appears to use a Functional format, which focuses on skills over chronological work history. Most ATS and recruiters prefer Chronological or Hybrid/Combination formats. Consider restructuring if this is the case.';
            }
            // Default suggestion if not functional or data is unavailable
            return 'Chronological or Hybrid/Combination resume formats are generally preferred by ATS and recruiters as they clearly show your work progression.';
        },
        getImpactExplanation: () =>
            'Functional resumes can be difficult for ATS to parse correctly and are often viewed less favorably by recruiters compared to chronological or hybrid formats.',
    },
    // Category: Formatting - Text & Symbols
    {
        id: 'FTx01', // Renamed from FT01 in design doc to avoid clash with File Type FT01
        description: 'Checks for use of non-standard fonts.',
        category: 'Formatting - Text',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            const standardFonts = [
                'arial', 'calibri', 'times new roman', 'verdana', 'helvetica', 'tahoma', 'georgia', 'garamond', 'courier new', 'lucida console'
            ];
            // Assumes fontsUsed is an array of lowercase font names
            return !!resumeData.formattingMetadata?.fontsUsed?.some(font => !standardFonts.includes(font.toLowerCase()));
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            const nonStandardFonts = resumeData?.formattingMetadata?.fontsUsed?.filter(font => ![
                'arial', 'calibri', 'times new roman', 'verdana', 'helvetica', 'tahoma', 'georgia', 'garamond', 'courier new', 'lucida console'
            ].includes(font.toLowerCase())).join(', ');
            return `Non-standard font(s) like '${nonStandardFonts || 'unknown'}' detected. Replace with standard fonts (e.g., Arial, Calibri, Times New Roman) for better ATS compatibility.`;
        },
        getImpactExplanation: () =>
            'Non-standard fonts may not be recognized by all ATS, potentially leading to parsing errors or unreadable text.',
    },
    {
        id: 'FTx04', // Renamed from FT04
        description: 'Detects use of unusual bullet points or special characters/symbols.',
        category: 'Formatting - Symbols',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            // This is a simplified check. A more robust check would involve regex for a wider range of unusual symbols.
            // For now, we check for a few common "fancy" bullets or symbols.
            const unusualCharsRegex = /[\u2756\u27A2\u27A4\u2610\u2611\u2612\u2605\u2606\u2666\u2665\u2660\u2663\u266B\u266A\u25BA\u25C4]/u; // Add more as needed
            return !!resumeData.rawText?.match(unusualCharsRegex) || !!resumeData.formattingMetadata?.usesUnusualBulletPoints;
        },
        getSuggestion: () =>
            'Unusual bullet points or special characters detected. Stick to standard round or square bullets (•, ▪, ◦) and avoid decorative symbols, as ATS might misinterpret them.',
        getImpactExplanation: () =>
            'Special characters and non-standard bullets can be rendered incorrectly or cause parsing issues in ATS.',
    },

    // Category: Section Content & Structure
    {
        id: 'SC01',
        description: 'Checks for presence of essential Contact Information (Name, Phone, Email).',
        category: 'Section Content',
        severity: AtsSeverity.Critical,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            const ci = resumeData.contactInfo;
            return !ci?.name || !ci?.phone || !ci?.email;
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            const missing = [];
            if (!resumeData?.contactInfo?.name) missing.push('Name');
            if (!resumeData?.contactInfo?.phone) missing.push('Phone Number');
            if (!resumeData?.contactInfo?.email) missing.push('Email Address');
            return `Essential contact information is missing: ${missing.join(', ')}. Ensure your Name, Phone, and Email are clearly listed.`;
        },
        getImpactExplanation: () =>
            'Missing essential contact information (Name, Phone, Email) means recruiters cannot reach you, even if your resume passes ATS.',
    },
    {
        id: 'SC02',
        description: 'Checks if Contact Information is in the main body, near the top.',
        category: 'Section Content',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            // This relies on parsedStructure.contactInfoLocation
            // 'body-top' is ideal. 'header' might be problematic for some ATS.
            const loc = resumeData.parsedStructure?.contactInfoLocation;
            return loc === 'header' || loc === 'footer' || loc === 'body-other'; // Problematic if not 'body-top'
        },
        getSuggestion: () =>
            'Ensure your contact information is placed in the main body of the resume, preferably near the top, not solely in headers or footers, for optimal ATS parsing.',
        getImpactExplanation: () =>
            'Contact information in headers or footers might be missed by some ATS. Placing it in the main body ensures visibility.',
    },
    {
        id: 'SC03',
        description: 'Checks for a professional email address format.',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) => {
            const email = resumeData.contactInfo?.email;
            if (!email) return false; // Handled by SC01
            // Basic check for "unprofessional" patterns. This can be subjective.
            const unprofessionalPatterns = ['loverboy', 'hotgirl', 'partyanimal', 'fluffy', 'kitty', 'gamergod']; // Add more
            return unprofessionalPatterns.some(pattern => email.toLowerCase().includes(pattern));
        },
        getSuggestion: () =>
            'Your email address may appear unprofessional. Use a standard email address format, typically including your name (e.g., firstname.lastname@email.com).',
        getImpactExplanation: () =>
            'An unprofessional email address can create a negative first impression with recruiters.',
    },
    {
        id: 'SC04',
        description: 'Checks for presence of Work Experience section.',
        category: 'Section Content',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !resumeData.experience || resumeData.experience.length === 0,
        getSuggestion: () =>
            'A Work Experience section was not found or is empty. This is a critical part of your resume. Add your relevant work history.',
        getImpactExplanation: () =>
            'The Work Experience section is vital for showcasing your qualifications and career progression. Its absence is a major drawback.',
    },
    {
        id: 'SC05',
        description: 'Checks for presence of Education section.',
        category: 'Section Content',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !resumeData.education || resumeData.education.length === 0,
        getSuggestion: () =>
            'An Education section was not found or is empty. This section is important for detailing your academic qualifications. Add your educational background.',
        getImpactExplanation: () =>
            'The Education section provides essential information about your academic qualifications.',
    },
    {
        id: 'SC06',
        description: 'Checks for presence of a dedicated Skills section.',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            !resumeData.skills || (Array.isArray(resumeData.skills.items) && resumeData.skills.items.length === 0),
        getSuggestion: () =>
            'A dedicated Skills section was not found or is empty. Clearly listing your skills helps ATS and recruiters quickly identify your capabilities. Consider adding a Skills section.',
        getImpactExplanation: () =>
            'A dedicated Skills section makes it easier for ATS to identify relevant keywords and for recruiters to quickly assess your capabilities.',
    },
    {
        id: 'SC07',
        description: 'Recommends a Professional Summary/Objective section.',
        category: 'Section Content',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: (resumeData: ResumeDataForATS) =>
            (!resumeData.summary || !resumeData.summary.text?.trim()) &&
            (!resumeData.objective || !resumeData.objective.text?.trim()),
        getSuggestion: () =>
            'Consider adding a Professional Summary or Objective section at the beginning of your resume to provide a concise overview of your qualifications and career goals.',
        getImpactExplanation: () =>
            'A Professional Summary or Objective can provide a quick snapshot of your profile for recruiters, though not all ATS prioritize it.',
    },

    // Category: Keyword Optimization (Basic) - General Advice
    {
        id: 'KO01',
        description: 'Advises natural integration of keywords (general advice, not a hard check).',
        category: 'Keyword Optimization',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: () => false, // This is advice, always "passes" the check but can be displayed as info
        getSuggestion: () =>
            "Integrate relevant keywords naturally throughout your resume, especially in your Work Experience and Skills sections. Avoid keyword stuffing.",
        getImpactExplanation: () =>
            "ATS often look for specific keywords related to the job. Natural integration helps your resume get noticed without appearing forced.",
    },
    {
        id: 'KO02',
        description: 'Recommends tailoring the resume with keywords for each job application.',
        category: 'Keyword Optimization',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: () => false, // This is advice
        getSuggestion: () =>
            "Tailor your resume with specific keywords from the job description for each application. This significantly increases your chances of matching what the ATS is looking for.",
        getImpactExplanation: () =>
            "Generic resumes are less effective. Customizing your resume with keywords from the job description shows direct relevance to the role.",
    },
    // Category: Formatting - Layout & Structure (Premium)
    {
        id: 'FL05',
        description: 'Checks if critical information (e.g., contact details) is only in headers/footers.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.High,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.parsedStructure?.contactInfoInHeaderOrFooterOnly,
        getSuggestion: () =>
            'Critical information like contact details appears to be only in the header or footer. Some ATS might miss this. Ensure key information is also in the main body of the resume.',
        getImpactExplanation: () =>
            'Information solely in headers/footers can be overlooked by certain ATS, potentially causing your application to be incomplete.',
    },
    {
        id: 'FL07',
        description: 'Discourages use of Functional resume format.',
        category: 'Formatting - Layout',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium, // This was Basic in FL08's check, but the rule itself is Premium for more direct discouragement
        check: (resumeData: ResumeDataForATS) =>
            resumeData.parsedStructure?.resumeFormatType === 'functional',
        getSuggestion: () =>
            'Your resume seems to follow a Functional format, emphasizing skills over chronological experience. While it can highlight skills, many ATS and recruiters prefer Chronological or Hybrid formats for clarity on work progression. Consider if a Hybrid format might better serve you.',
        getImpactExplanation: () =>
            'Functional resumes can be harder for ATS to parse and may not provide the chronological context many recruiters look for.',
    },

    // Category: Formatting - Text & Symbols (Premium)
    {
        id: 'FTx02', // Renamed from FT02
        description: 'Checks body text font size (ideal 10-12pt, warn <10pt).',
        category: 'Formatting - Text',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            const sizes = resumeData.formattingMetadata?.bodyTextFontSizes;
            if (!sizes || sizes.length === 0) return false;
            // Warn if any body text font size is below 10pt
            return sizes.some(size => size < 10);
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            const smallSizes = resumeData?.formattingMetadata?.bodyTextFontSizes?.filter(s => s < 10).join(', ');
            return `Body text font size appears to be too small (e.g., ${smallSizes || 'less than 10pt'}). Aim for 10-12pt for readability.`;
        },
        getImpactExplanation: () =>
            'Font sizes smaller than 10pt can be difficult to read for both ATS and human reviewers.',
    },
    {
        id: 'FTx03', // Renamed from FT03
        description: 'Checks heading font size (ideal 14-16pt).',
        category: 'Formatting - Text',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            const sizes = resumeData.formattingMetadata?.headingFontSizes;
            if (!sizes || sizes.length === 0) return false;
            // Warn if heading sizes are outside a reasonable range (e.g., <12 or >20 for this example)
            return sizes.some(size => size < 12 || size > 20);
        },
        getSuggestion: () =>
            'Ensure heading font sizes are appropriate (typically 14-16pt, slightly larger than body text) for clear visual hierarchy. Avoid excessively large or small headings.',
        getImpactExplanation: () =>
            'Inconsistent or inappropriate heading sizes can make the resume look unprofessional and harder to scan.',
    },
    {
        id: 'FTx05', // Renamed from FT05
        description: 'Detects "white font" or hidden text for keyword stuffing.',
        category: 'Formatting - Text',
        severity: AtsSeverity.Critical,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) =>
            !!resumeData.formattingMetadata?.hasWhiteFontOrHiddenText, // This would require sophisticated parsing
        getSuggestion: () =>
            'Potential hidden text (e.g., white font on white background) detected. This is considered an unethical trick for keyword stuffing and can lead to rejection.',
        getImpactExplanation: () =>
            'Using hidden text is a black-hat tactic that, if detected by ATS or recruiters, will almost certainly lead to your application being discarded.',
    },
    {
        id: 'FTx06', // Renamed from FT06
        description: 'Checks for meaningful hyperlink text (e.g., full URL vs. "click here").',
        category: 'Formatting - Text',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // This check would require parsing hyperlink anchor text.
            // For now, we assume a flag `hasMeaningfulHyperlinkText` (false if "click here" type links exist)
            return resumeData.formattingMetadata?.hasMeaningfulHyperlinkText === false;
        },
        getSuggestion: () =>
            'Ensure hyperlink text is descriptive (e.g., your LinkedIn profile URL or "View Project Portfolio") rather than generic phrases like "click here". If providing URLs, ensure they are complete and clickable.',
        getImpactExplanation: () =>
            'Clear hyperlink text is more professional and accessible. Some ATS may extract URLs, so ensure they are correctly formatted.',
    },
    // Category: Section Content & Structure (Premium)
    {
        id: 'SC08',
        description: 'Checks for standard section headings (e.g., "Work Experience" vs. "My Journey").',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            const standardHeadings = [
                'contact', 'summary', 'objective', 'experience', 'work experience', 'employment history',
                'education', 'qualifications', 'skills', 'technical skills', 'projects', 'personal projects',
                'certifications', 'licenses', 'awards', 'publications', 'references', 'portfolio', 'links'
            ];
            // Assumes sectionHeadings is an array of lowercase strings
            return !!resumeData.sectionHeadings?.some(h =>
                !standardHeadings.includes(h.toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim()) &&
                h.length > 0 // Ensure not an empty heading from parsing
            );
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            const standardHeadingsExamples = ["Work Experience", "Education", "Skills", "Projects", "Certifications"];
            const nonStandard = resumeData?.sectionHeadings?.filter(h =>
                !standardHeadingsExamples.map(sh => sh.toLowerCase()).includes(h.toLowerCase()) && h.length > 0
            ).join('", "');

            if (nonStandard) {
                return `Non-standard section heading(s) like "${nonStandard}" detected. Use conventional headings (e.g., ${standardHeadingsExamples.slice(0, 3).join(", ")}...) for better ATS parsing.`;
            }
            return `Use conventional section headings (e.g., ${standardHeadingsExamples.slice(0, 3).join(", ")}...) for better ATS parsing.`;
        },
        getImpactExplanation: () =>
            'ATS are programmed to look for standard section titles. Unconventional names can cause sections to be miscategorized or overlooked.',
    },
    {
        id: 'SC09',
        description: 'Checks for consistent date formatting (e.g., MM/YYYY or Month YYYY).',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // This requires parsing all dates from experience and education sections.
            // A simple check: if resumeData.allDates contains varied formats.
            // Example: ['05/2020', 'May 2018', '2017-03'] would be inconsistent.
            // For now, this is a placeholder for more complex date parsing logic.
            // Let's assume a flag `hasInconsistentDateFormats` is set if issues are found.
            const dates = resumeData.allDates;
            if (!dates || dates.length < 2) return false; // Not enough dates to check consistency

            const formats = dates.map(dateStr => {
                if (/^\d{1,2}\/\d{4}$/.test(dateStr)) return 'MM/YYYY';
                if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/i.test(dateStr)) return 'Month YYYY';
                if (/^\d{4}-\d{1,2}$/.test(dateStr)) return 'YYYY-MM';
                if (/^\d{4}$/.test(dateStr)) return 'YYYY'; // Year only might be acceptable in some contexts
                return 'unknown';
            });
            const uniqueFormats = new Set(formats.filter(f => f !== 'unknown'));
            return uniqueFormats.size > 1; // More than one valid format detected
        },
        getSuggestion: () =>
            'Inconsistent date formats detected. Use a consistent format throughout your resume (e.g., MM/YYYY or Month YYYY) for all dates in your experience and education sections.',
        getImpactExplanation: () =>
            'Inconsistent date formatting can confuse ATS and make it difficult to establish a clear timeline of your experience and education.',
    },
    {
        id: 'SC10',
        description: 'Suggests using standard job titles or clarifying non-standard ones.',
        category: 'Section Content',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // This would require a list of "non-standard" or overly creative job titles.
            // Example: "Chief Happiness Officer", "Coding Ninja"
            // For now, a placeholder. Assume a flag `usesNonStandardJobTitles`
            const creativeTitles = ["ninja", "guru", "wizard", "rockstar", "evangelist", "visionary"]; // simplified
            return !!resumeData.experience?.some(exp =>
                exp.jobTitle && creativeTitles.some(ct => exp.jobTitle!.toLowerCase().includes(ct))
            );
        },
        getSuggestion: () =>
            'If using creative or non-standard job titles, consider adding a more conventional equivalent in parentheses (e.g., "Coding Ninja (Software Developer)") to ensure ATS can categorize your role correctly.',
        getImpactExplanation: () =>
            'While creative titles can show personality, ATS may not recognize them. Standard titles or clarifications help in proper categorization.',
    },
    {
        id: 'SC11',
        description: 'Checks for excessive abbreviations without prior full spelling (if detectable).',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // This is complex. Requires identifying abbreviations and checking if they were defined.
            // Placeholder: assume a flag `hasUndefinedAbbreviations`
            // A simple heuristic: look for 3-4 letter all-caps words that aren't common (e.g. "CRM" is fine, "ASDF" might not be)
            // and aren't defined earlier in the text.
            const commonAcronyms = ['CEO', 'CTO', 'MBA', 'BSC', 'MSC', 'PHD', 'USA', 'UK', 'CRM', 'ERP', 'SQL', 'HTML', 'CSS', 'JSON', 'REST', 'API'];
            const text = resumeData.rawText || "";
            const potentialAcronyms = text.match(/\b[A-Z]{3,5}\b/g) || [];
            let undefinedAcronyms = 0;
            potentialAcronyms.forEach(acronym => {
                if (!commonAcronyms.includes(acronym.toUpperCase())) {
                    // Crude check: if the acronym itself (not its expansion) appears before a potential expansion.
                    // This is very basic and prone to errors.
                    // A proper check would need NLP to identify expansions.
                    const acronymRegex = new RegExp(`\\b${acronym}\\b`, 'g');
                    const expansionRegex = new RegExp(`\\b(${acronym.split('').join('[a-zA-Z]*\\s*')})\\b`, 'i'); // very loose

                    const acronymFirstOccurrence = text.search(acronymRegex);
                    const expansionFirstOccurrence = text.search(expansionRegex);

                    if (acronymFirstOccurrence !== -1 && (expansionFirstOccurrence === -1 || acronymFirstOccurrence < expansionFirstOccurrence)) {
                        // If acronym appears and no expansion found, or acronym appears before a potential loose expansion
                        // This is a very weak check for demonstration.
                        // A more robust system would use a dictionary or NLP.
                        // For now, let's assume if it's not common and appears, it's a potential issue.
                        // This rule needs significant refinement for real-world use.
                        // For this exercise, let's simplify: if an uncommon ALL CAPS word of 3-5 letters exists, flag it.
                        // This is NOT a good real-world check.
                        undefinedAcronyms++;
                    }
                }
            });
            return undefinedAcronyms > 1; // Flag if more than one potentially undefined/uncommon acronym
        },
        getSuggestion: () =>
            'Avoid using too many abbreviations or industry jargon without spelling them out first, especially if they are not widely known. For example, "Customer Relationship Management (CRM)".',
        getImpactExplanation: () =>
            'ATS and recruiters may not understand uncommon abbreviations, leading to misinterpretation of your skills or experience.',
    },
    // TODO: Add Premium rules for Keyword Optimization (Advanced)
];

export const getAtsRules = (tier: AtsRuleTier = AtsRuleTier.Basic): AtsRule[] => {
    if (tier === AtsRuleTier.Premium) {
        return atsRules; // For now, premium includes all basic. This will be filtered later.
    }
    return atsRules.filter(rule => rule.tier === AtsRuleTier.Basic);
};

// Function to run all applicable rules against resume data
export const checkResumeWithAts = (
    resumeData: ResumeDataForATS,
    tier: AtsRuleTier = AtsRuleTier.Basic,
    jobDescriptionText?: string,
) => {
    const applicableRules = getAtsRules(tier);
    const issues = applicableRules
        .filter(rule => rule.check(resumeData, jobDescriptionText))
        .map(rule => ({
            ruleId: rule.id,
            description: rule.description,
            severity: rule.severity,
            suggestion: rule.getSuggestion(resumeData),
            impactExplanation: rule.getImpactExplanation(),
            category: rule.category,
            tier: rule.tier,
        }));
    return issues;
};

// Placeholder for scoring logic
export const calculateAtsScore = (issues: ReturnType<typeof checkResumeWithAts>): number => {
    let score = 100;
    issues.forEach(issue => {
        switch (issue.severity) {
            case AtsSeverity.Critical:
                score -= 25; // Example deduction
                break;
            case AtsSeverity.High:
                score -= 12;
                break;
            case AtsSeverity.Medium:
                score -= 6;
                break;
            case AtsSeverity.Low:
                score -= 2;
                break;
        }
    });
    return Math.max(0, score); // Score cannot be negative
};

export default atsRules;
