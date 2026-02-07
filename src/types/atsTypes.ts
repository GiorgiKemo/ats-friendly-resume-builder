export enum AtsSeverity {
    Critical = "Critical",
    High = "High",
    Medium = "Medium",
    Low = "Low",
}

export enum AtsRuleTier {
    Basic = "Basic",
    Premium = "Premium",
}

export interface AtsRule {
    id: string;
    description: string;
    category: string;
    severity: AtsSeverity;
    tier: AtsRuleTier;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    check: (resumeData: ResumeDataForATS, jobDescriptionText?: string) => boolean; // true if issue detected
    getSuggestion: (resumeData?: ResumeDataForATS) => string; // Suggestion might be dynamic
    getImpactExplanation: () => string;
}

export interface AtsIssue {
    ruleId: string;
    description: string;
    severity: AtsSeverity;
    suggestion: string;
    impactExplanation: string;
    category: string;
    tier: AtsRuleTier;
}

// This represents the data structure the ATS checker will operate on.
// It will be populated from ResumeContext for in-platform resumes,
// or from parsing logic for uploaded resumes.

export interface ResumeContactInfo {
    name?: string;
    phone?: string;
    email?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    address?: string; // Could be a structured object if needed
}

export interface ResumeExperienceEntry {
    jobTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    isCurrent?: boolean;
}

export interface ResumeEducationEntry {
    degree?: string;
    institution?: string;
    location?: string;
    startDate?: string; // Or graduationDate
    endDate?: string;   // Or graduationDate
    description?: string;
}

export interface ResumeSkillsSection {
    // Assuming skills are stored as an array of strings or objects
    // This needs to align with how ResumeContext stores skills
    items?: { name: string; level?: string }[] | string[];
    // Or a more structured approach if skills are categorized
    // categorizedSkills?: { categoryName: string; skills: string[] }[];
}

export interface ResumeSummarySection {
    text?: string;
}

export interface ResumeSection {
    id: string;
    name: string; // e.g., "Work Experience", "Education"
    // content: any; // Generic content, or specific types per section
    items?: any[]; // For sections like experience, education
    content?: string; // For sections like summary
    visible?: boolean;
}

// Placeholder for information derived from parsing the resume's layout and formatting.
// For in-platform resumes, this might be inferred from template choice and content structure.
export interface ResumeParsedStructure {
    usesTablesForLayout?: boolean;        // FL01
    usesMultiColumnLayout?: boolean;      // FL02
    containsImagesOrCharts?: boolean;     // FL03
    containsTextBoxes?: boolean;          // FL04
    contactInfoInHeaderOrFooterOnly?: boolean; // FL05
    isSingleColumnLayout?: boolean;       // FL06 (inverse of usesMultiColumnLayout or more specific)
    resumeFormatType?: 'chronological' | 'functional' | 'hybrid' | 'unknown'; // FL07, FL08
    contactInfoLocation?: 'header' | 'footer' | 'body-top' | 'body-other' | 'unknown'; // SC02
    // ... other structural flags
}

export interface ResumeFormattingMetadata {
    fontsUsed?: string[];                 // FTx01 (Formatting-Text rule 1)
    bodyTextFontSizes?: number[];         // FTx02
    headingFontSizes?: number[];          // FTx03
    usesUnusualBulletPoints?: boolean;    // FTx04
    hasWhiteFontOrHiddenText?: boolean;   // FTx05
    hasMeaningfulHyperlinkText?: boolean; // FTx06 (check on links)
    // ... other formatting metadata
}

export interface ResumeDataForATS {
    // From File Type & Upload category
    fileType?: 'docx' | 'pdf' | 'txt' | 'in-platform' | 'image'; // FT01, FT03. 'in-platform' for builder.
    isPdfImageBased?: boolean;            // FT02

    // Raw text content, crucial for many checks
    rawText?: string;                     // FT02, FTx04, FTx05, SC11

    // Structured content from ResumeContext or parsing
    contactInfo?: ResumeContactInfo;      // SC01, SC03
    experience?: ResumeExperienceEntry[]; // SC04, SC09, SC10
    education?: ResumeEducationEntry[];   // SC05, SC09
    skills?: ResumeSkillsSection;         // SC06
    summary?: ResumeSummarySection;       // SC07
    objective?: ResumeSummarySection;     // SC07 (alternative to summary)
    sections?: ResumeSection[];           // SC08 (to check headings), FL07, FL08

    // Parsed structure and formatting metadata
    parsedStructure?: ResumeParsedStructure;
    formattingMetadata?: ResumeFormattingMetadata;

    // Potentially, direct access to all section headings
    sectionHeadings?: string[];           // SC08
    // Potentially, all dates for consistency check
    allDates?: string[];                  // SC09
}