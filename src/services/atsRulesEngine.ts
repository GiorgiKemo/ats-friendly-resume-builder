import {
    AtsRule,
    AtsSeverity,
    AtsRuleTier,
    ResumeDataForATS,
} from '../types/atsTypes.js';

const standardSectionHeadings = new Set([
    'contact', 'contact information', 'summary', 'professional summary', 'objective',
    'experience', 'professional experience', 'work experience', 'employment history',
    'education', 'qualifications', 'skills', 'technical skills', 'core competencies',
    'projects', 'personal projects', 'additional projects', 'certifications', 'licenses',
    'certifications licenses', 'awards', 'publications', 'references', 'portfolio', 'links',
    'languages', 'volunteering', 'volunteer experience',
]);
const isNonStandardHeading = (heading: string) => {
    const normalized = heading.toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
    return normalized.length > 0 && !standardSectionHeadings.has(normalized);
};
const COMMON_ACRONYMS = new Set([
    'API', 'BSC', 'CEO', 'CSS', 'CRM', 'CTO', 'ERP', 'HTML', 'JSON',
    'MBA', 'MSC', 'PHD', 'REST', 'SQL', 'UK', 'USA',
]);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findUnexpandedAcronyms = (rawText = '') => {
    const text = `${rawText}`;
    const tokens = [...new Set(text.match(/\b[A-Z]{3,5}\b/g) || [])];
    return tokens.filter((acronym) => {
        if (COMMON_ACRONYMS.has(acronym)) return false;
        const escaped = escapeRegExp(acronym);
        const expansionBefore = new RegExp(`(?:\\b[A-Za-z][A-Za-z'-]*\\s+){1,6}\\(${escaped}\\)`, 'i');
        const expansionAfter = new RegExp(`\\b${escaped}\\s*\\([^)]{3,80}\\)`, 'i');
        return !expansionBefore.test(text) && !expansionAfter.test(text);
    });
};

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
            'Image-based resumes provide little or no selectable text for many automated readers, so important information may be missed during review.',
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
            'Image-based PDFs provide little or no selectable text for many automated readers, so important information may be missed during review.',
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
            "While text-based PDFs are often acceptable, .docx files are widely supported by many ATS. Consider using .docx if you encounter parsing issues, or keep the resume text-native. Avoid .txt if complex formatting is needed.",
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
            'Tables can change the reading order for some parsers, which may make the extracted content harder to interpret.',
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
            'Some parsers read columns in an unexpected order, which may make the extracted resume harder to interpret.',
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
            'Images, charts, or other graphics were detected. Automated text readers may not capture their meaning, so keep essential information in selectable text.',
        getImpactExplanation: () =>
            'Information stored only in graphics may not appear in extracted text and can affect how nearby content is read.',
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
            'Text boxes can be omitted or reordered by some parsers, so important content may not appear where expected.',
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
            'Your resume appears to use a multi-column layout. For more predictable parsing and readability, a single-column layout is generally recommended.',
        getImpactExplanation: () =>
            'A single-column layout is a practical way to make reading order more predictable across different parsers.',
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
                return 'Your resume appears to use a Functional format, which focuses on skills over chronological work history. Consider a chronological or hybrid format if showing progression is important for this role.';
            }
            // Default suggestion if not functional or data is unavailable
            return 'Chronological or Hybrid/Combination formats make work progression easier for people and automated readers to follow when that context matters.';
        },
        getImpactExplanation: () =>
            'Functional resumes can make chronology harder to identify for parsers and reviewers who need a clear work timeline.',
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
            return `Non-standard font(s) like '${nonStandardFonts || 'unknown'}' detected. Replace with standard fonts (e.g., Arial, Calibri, Times New Roman) for more predictable parsing.`;
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
            // Keep this detector bounded and explainable; the parser adapter can
            // also provide a stronger signal when it has inspected the source file.
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
            'Missing contact details can prevent a reviewer from reaching you, regardless of how the document is parsed.',
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
            'Place contact information in the main body, preferably near the top, rather than relying only on headers or footers for more predictable extraction.',
        getImpactExplanation: () =>
            'Contact information in headers or footers might be missed by some parsers. Placing it in the main body makes the information easier to extract and review.',
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
        check: (resumeData: ResumeDataForATS) => {
            const items = resumeData.skills?.items;
            if (!Array.isArray(items)) return true;
            return items.every((item) => {
                const value = typeof item === 'string' ? item : item?.name;
                return !value || (typeof value === 'string' ? !value.trim() : false);
            });
        },
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
            "Many screening systems and reviewers look for role-relevant terms. Natural integration helps clarify relevance without keyword stuffing.",
    },
    {
        id: 'KO02',
        description: 'Recommends tailoring the resume with keywords for each job application.',
        category: 'Keyword Optimization',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Basic,
        check: () => false, // This is advice
        getSuggestion: () =>
            "Tailor your resume with specific terms from the job description when they truthfully match your experience. This can make relevant evidence easier to find during review.",
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
            'Functional resumes can make chronology harder for parsers and reviewers to identify when a role depends on a clear work timeline.',
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
            // This flag is supplied by the document parser when source metadata
            // is available; in-platform resumes leave it unset.
            !!resumeData.formattingMetadata?.hasWhiteFontOrHiddenText,
        getSuggestion: () =>
            'Potential hidden text (e.g., white font on white background) detected. This is considered an unethical trick for keyword stuffing and can lead to rejection.',
        getImpactExplanation: () =>
            'Hidden text is a manipulative formatting tactic that can undermine trust and may cause a document to be rejected when detected.',
    },
    {
        id: 'FTx06', // Renamed from FT06
        description: 'Checks for meaningful hyperlink text (e.g., full URL vs. "click here").',
        category: 'Formatting - Text',
        severity: AtsSeverity.Low,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // The parser adapter supplies this flag after inspecting hyperlink
            // anchor text; do not infer it from raw URL strings.
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
            return !!resumeData.sectionHeadings?.some(isNonStandardHeading);
        },
        getSuggestion: (resumeData?: ResumeDataForATS) => {
            const standardHeadingsExamples = ["Work Experience", "Education", "Skills", "Projects", "Certifications"];
            const nonStandard = resumeData?.sectionHeadings?.filter(isNonStandardHeading).join('", "');

            if (nonStandard) {
                return `Non-standard section heading(s) like "${nonStandard}" detected. Use conventional headings (e.g., ${standardHeadingsExamples.slice(0, 3).join(", ")}...) for better ATS parsing.`;
            }
            return `Use conventional section headings (e.g., ${standardHeadingsExamples.slice(0, 3).join(", ")}...) for better ATS parsing.`;
        },
        getImpactExplanation: () =>
            'Many systems use conventional section titles as parsing signals. Unconventional names can make a section harder to classify or find.',
    },
    {
        id: 'SC09',
        description: 'Checks for consistent date formatting (e.g., MM/YYYY or Month YYYY).',
        category: 'Section Content',
        severity: AtsSeverity.Medium,
        tier: AtsRuleTier.Premium,
        check: (resumeData: ResumeDataForATS) => {
            // Dates are supplied by the parser or the in-platform adapter. Keep
            // this classifier conservative: unknown strings are not guessed into
            // a calendar format, while a mix of known formats is surfaced.
            const dates = resumeData.allDates;
            if (!dates || dates.length < 2) return false; // Not enough dates to check consistency

            const formats = dates.map(dateStr => {
                const value = `${dateStr}`.trim();
                if (/^\d{1,2}[/-]\d{4}$/.test(value)) return 'MM/YYYY';
                if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/i.test(value)) return 'Month YYYY';
                if (/^\d{4}[-/]\d{1,2}$/.test(value)) return 'YYYY-MM';
                if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) return 'YYYY-MM-DD';
                if (/^\d{4}$/.test(value)) return 'YYYY'; // Year only might be acceptable in some contexts
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
            // This is a small, explainable heuristic rather than a claim that a
            // title is objectively wrong. The suggestion lets the user clarify
            // an unusual title while preserving source facts.
            const creativeTitles = ["ninja", "guru", "wizard", "rockstar", "evangelist", "visionary"];
            return !!resumeData.experience?.some(exp =>
                typeof exp.jobTitle === 'string' && creativeTitles.some(ct => exp.jobTitle!.toLowerCase().includes(ct))
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
        check: (resumeData: ResumeDataForATS) => findUnexpandedAcronyms(resumeData.rawText).length > 1,
        getSuggestion: () =>
            'Avoid using too many abbreviations or industry jargon without spelling them out first, especially if they are not widely known. For example, "Customer Relationship Management (CRM)".',
        getImpactExplanation: () =>
            'ATS and recruiters may not understand uncommon abbreviations, leading to misinterpretation of your skills or experience.',
    },
];

export const getAtsRules = (tier: AtsRuleTier = AtsRuleTier.Basic): AtsRule[] => {
    if (tier === AtsRuleTier.Premium) {
        return atsRules;
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

// Deterministic checklist score. This is a guidance signal, not a hiring or
// employer-system prediction; the UI labels it as a resume checklist score.
export const calculateAtsScore = (issues: ReturnType<typeof checkResumeWithAts>): number => {
    let score = 100;
    issues.forEach(issue => {
        switch (issue.severity) {
            case AtsSeverity.Critical:
                score -= 25;
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
