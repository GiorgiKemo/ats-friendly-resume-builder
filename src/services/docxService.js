import { Document, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType, Packer } from 'docx';
import { saveAs } from 'file-saver';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const DEBUG_DOCX = import.meta.env.DEV && import.meta.env.VITE_DEBUG_DOCX === 'true';
const debugLog = (...args) => {
  if (DEBUG_DOCX) console.log(...args);
};

/**
 * Convert a base64 string to a Blob object
 * @param {string} base64 - The base64 string
 * @param {string} mimeType - The MIME type of the blob
 * @returns {Blob} - The blob object
 */
function base64ToBlob(base64, mimeType) {
  // Convert base64 to binary string
  const byteCharacters = atob(base64);
  const byteArrays = [];

  // Slice the binary string into smaller chunks
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);

    // Convert each character to its byte value
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    // Create a typed array from the byte values
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  // Create a blob from the byte arrays
  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Generate a DOCX document from a resume object
 * @param {Object} resume - The resume data
 * @param {string} filename - The filename for the downloaded DOCX
 */
export const downloadResumeDocx = async (resume, filename = 'resume') => {
  try {
    // Use the resume data directly
    const completeResume = resume || {};

    // Log the resume structure to help with debugging (dev-only)
    debugLog('Resume data for DOCX export:', JSON.stringify(completeResume, null, 2));

    // Debug function to inspect nested objects
    const debugObject = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      Object.keys(obj).forEach(key => {
        debugLog(`${path}${key}: ${typeof obj[key] === 'object' ? 'Object/Array' : obj[key]}`);
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (Array.isArray(obj[key])) {
            debugLog(`${path}${key} is array with ${obj[key].length} items`);
            if (obj[key].length > 0) {
              debugObject(obj[key][0], `${path}${key}[0].`);
            }
          } else {
            debugObject(obj[key], `${path}${key}.`);
          }
        }
      });
    };

    // Debug the resume structure
    if (DEBUG_DOCX) {
      debugObject(completeResume, '');
    }

    // Handle both camelCase and snake_case property names
    const personalInfo = completeResume.personalInfo || completeResume.personal_info || {};
    const workExperience = completeResume.workExperience || completeResume.work_experience || [];
    const education = completeResume.education || [];
    const skills = Array.isArray(completeResume.skills) ? completeResume.skills : [];
    const certifications = completeResume.certifications || [];
    const projects = completeResume.projects || [];

    // Create a new document
    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: "Normal",
            name: "Normal",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 24, // 12pt
              font: "Times New Roman",
            },
            paragraph: {
              spacing: {
                line: 276, // 1.15 line spacing
              },
            },
          },
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 32, // 16pt
              bold: true,
              font: "Times New Roman",
            },
            paragraph: {
              spacing: {
                before: 240, // 12pt before
                after: 120, // 6pt after
              },
            },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 28, // 14pt
              bold: true,
              font: "Times New Roman",
            },
            paragraph: {
              spacing: {
                before: 240, // 12pt before
                after: 120, // 6pt after
              },
              border: {
                bottom: {
                  color: "auto",
                  space: 1,
                  style: BorderStyle.NIL,
                  size: 0,
                },
              },
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                right: 1440, // 1 inch
                bottom: 1440, // 1 inch
                left: 1440, // 1 inch
              },
            },
          },
          children: [
            // Personal Information
            new Paragraph({
              text: personalInfo.fullName || personalInfo.full_name || "Full Name",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),

            // Contact Information
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: [
                    personalInfo.email || "",
                    personalInfo.phone || "",
                    personalInfo.location || "",
                    (personalInfo.linkedin || personalInfo.professionalLinks?.linkedin) ?
                      `LinkedIn: ${personalInfo.linkedin || personalInfo.professionalLinks?.linkedin}` : "",
                  ].filter(Boolean).join(" | "),
                  size: 20, // 10pt
                }),
              ],
            }),

            // Professional Summary (if available)
            ...((personalInfo.summary || personalInfo.professionalSummary) ? [
              new Paragraph({
                text: "Professional Summary",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              new Paragraph({
                text: personalInfo.summary || personalInfo.professionalSummary || "",
                spacing: {
                  after: 200,
                },
              }),
            ] : []),

            // Core Competencies (Skills)
            ...(skills.length > 0 ? [
              new Paragraph({
                text: "Core Competencies",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              // Create a simple comma-separated list of skills
              new Paragraph({
                text: Array.isArray(skills)
                  ? skills.map(skill => typeof skill === 'string' ? skill : (skill.name || skill.skill || '')).join(', ')
                  : (typeof skills === 'string' ? skills : ''),
                spacing: {
                  before: 100,
                  after: 100,
                },
              }),
              // Add some space after the table
              new Paragraph({
                text: "",
                spacing: {
                  after: 200,
                },
              }),
            ] : []),

            // Work Experience
            ...(workExperience.length > 0 ? [
              new Paragraph({
                text: "Professional Experience",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              ...workExperience.flatMap(job => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: job.title || job.jobTitle || job.position || job.role || "Job Title",
                      bold: true,
                    }),
                  ],
                  spacing: {
                    before: 200,
                  },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${job.company || job.companyName || job.employer || job.organization || "Company"} | ${job.startDate || job.start_date || job.from || ""} - ${job.current || job.isCurrentRole || job.isCurrent ? "Present" : job.endDate || job.end_date || job.to || ""}`,
                      italics: true,
                    }),
                  ],
                  spacing: {
                    after: 200,
                  },
                }),
                ...((job.responsibilities || job.description || job.achievements || job.duties) ?
                  (job.responsibilities || job.description || job.achievements || job.duties).toString().replace(/\\n/g, '\n').split('\n').map(responsibility =>
                    new Paragraph({
                      text: responsibility.trim(),
                      bullet: {
                        level: 0,
                      },
                    })
                  ) : []),
              ]),
            ] : []),

            // Education
            ...(education.length > 0 ? [
              new Paragraph({
                text: "Education",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              ...education.flatMap(edu => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: edu.degree || edu.degreeType || edu.degreeName || (edu.field || edu.fieldOfStudy || edu.major ? `${edu.degreeLevel || "Degree"} in ${edu.field || edu.fieldOfStudy || edu.major}` : "Degree"),
                      bold: true,
                    }),
                  ],
                  spacing: {
                    before: 200,
                  },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${edu.institution || edu.school || edu.university || edu.college || "Institution"} | ${edu.startDate || edu.start_date || edu.from || edu.yearStart || ""} - ${edu.current || edu.isCurrentlyEnrolled ? "Present" : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || "")}`,
                      italics: true,
                    }),
                  ],
                  spacing: {
                    after: 200,
                  },
                }),
                ...(edu.description || edu.details ? [
                  new Paragraph({
                    text: edu.description || edu.details || "",
                  }),
                ] : []),
              ]),
            ] : []),

            // Certifications & Licenses
            ...(certifications.length > 0 ? [
              new Paragraph({
                text: "Certifications & Licenses",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              ...certifications.flatMap(cert => [
                // Certification name
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cert.name || cert.title || cert.certification || "Certification",
                      bold: true,
                    }),
                  ],
                  spacing: {
                    before: 200,
                  },
                }),
                // Issuing organization
                new Paragraph({
                  text: cert.issuer || cert.organization || cert.issuingOrganization || "Issuer",
                }),
                // Issue date
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Issue Date: ${cert.date || cert.issueDate || cert.year || "Not Specified"}`,
                      italics: true,
                    }),
                  ],
                  spacing: {
                    after: 200,
                  },
                }),
              ]),
            ] : []),

            // Additional Projects
            ...(projects.length > 0 ? [
              new Paragraph({
                text: "Additional Projects",
                heading: HeadingLevel.HEADING_2,
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),
              ...projects.flatMap(project => [
                // Project title
                new Paragraph({
                  children: [
                    new TextRun({
                      text: project.name || project.title || project.projectName ||
                             // Try to extract a title from the description if no name is provided
                             (project.description && project.description.split('\n')[0]?.trim().split('.')[0]) ||
                             "Project Name",
                      bold: true,
                    }),
                  ],
                  spacing: {
                    before: 200,
                  },
                }),
                // Project date - handle different date formats
                new Paragraph({
                  children: [
                    new TextRun({
                      text: (() => {
                        // Check for date ranges in the format "Oct 2023 - Mar 2024"
                        if (project.date || project.duration || project.timeframe || project.period) {
                          return project.date || project.duration || project.timeframe || project.period;
                        }
                        // Check for specific start and end dates
                        else if (project.startDate || project.start_date || project.endDate || project.end_date) {
                          const startDate = project.startDate || project.start_date || '';
                          const endDate = project.current || project.isCurrentProject ? 'Present' : (project.endDate || project.end_date || '');
                          if (startDate || endDate) {
                            return startDate + (startDate && endDate ? ' - ' : '') + endDate;
                          }
                        }
                        return "Completion Date: Not Specified";
                      })(),
                      italics: true,
                    }),
                  ],
                }),
                // Project description with bullet points
                ...(project.description || project.details || project.summary ?
                  // If the description has bullet points, preserve them
                  (project.description || project.details || project.summary).toString().split('\n').map(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return null;

                    // If line already starts with a bullet point, don't add another one via the bullet property
                    if (trimmedLine.startsWith('•')) {
                      return new Paragraph({
                        text: trimmedLine,
                        spacing: {
                          after: 80,
                        },
                      });
                    } else {
                      return new Paragraph({
                        text: trimmedLine,
                        bullet: {
                          level: 0,
                        },
                        spacing: {
                          after: 80,
                        },
                      });
                    }
                  }).filter(Boolean)
                : []),
                // Technologies
                ...(project.technologies || project.techStack || project.tools ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Technologies: ${project.technologies || project.techStack || project.tools || ""}`,
                        italics: true,
                      }),
                    ],
                    spacing: {
                      after: 200,
                    },
                  }),
                ] : []),
              ]),
            ] : []),
          ],
        },
      ],
    });

    // Clean the filename
    const cleanName = (filename || 'resume')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    // Different export methods for browser vs Node.js environments
    if (isBrowser) {
      try {
        // In browser environments, use toBlob
        debugLog('Using browser-compatible Packer.toBlob method');
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${cleanName}.docx`);
      } catch (browserError) {
        console.error('Error with Packer.toBlob:', browserError);

        // Fallback to another browser-compatible method
        try {
          debugLog('Trying alternative browser export method');
          const arrayBuffer = await Packer.toBase64String(doc);
          const blob = base64ToBlob(arrayBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          saveAs(blob, `${cleanName}.docx`);
        } catch (fallbackError) {
          console.error('Error with fallback method:', fallbackError);
          throw new Error(`Browser export failed: ${fallbackError.message}`);
        }
      }
    } else {
      // In Node.js environments, use toBuffer
      await Packer.toBuffer(doc);
      // Node.js specific handling would go here
      // This branch won't be executed in the browser
    }

    return true;
  } catch (error) {
    console.error('Error generating or downloading DOCX:', error);
    throw new Error(`Failed to export resume as DOCX: ${error.message}`);
  }
};
