import { Document, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType, Packer } from 'docx';
import { saveAs } from 'file-saver';

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const DEBUG_DOCX = import.meta.env.DEV && import.meta.env.VITE_DEBUG_DOCX === 'true';
const debugLog = (...args) => {
  if (DEBUG_DOCX) console.log(...args);
};

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Template-specific configuration for DOCX export
 */
const getTemplateConfig = (template) => {
  const configs = {
    'ats-friendly': {
      nameAlign: AlignmentType.CENTER,
      nameUppercase: false,
      sectionHeadingUppercase: false,
      headingBorder: true, // underline on section headings
      headingColor: '000000',
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Core Competencies',
        experience: 'Professional Experience',
        education: 'Education',
        certifications: 'Certifications & Licenses',
        projects: 'Additional Projects',
      },
      skillsLayout: 'bullets', // bullet list
      font: 'Arial',
    },
    'basic': {
      nameAlign: AlignmentType.CENTER,
      nameUppercase: false,
      sectionHeadingUppercase: false,
      headingBorder: true,
      headingColor: '000000',
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'comma',
      font: 'Times New Roman',
    },
    'minimalist': {
      nameAlign: AlignmentType.LEFT,
      nameUppercase: false,
      sectionHeadingUppercase: true,
      headingBorder: false,
      headingColor: '000000',
      sectionNames: {
        summary: 'Summary',
        skills: 'Skills',
        experience: 'Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'dot-separated',
      font: 'Arial',
    },
    'traditional': {
      nameAlign: AlignmentType.CENTER,
      nameUppercase: true,
      sectionHeadingUppercase: true,
      headingBorder: false,
      headingColor: '000000',
      headerThickLine: true,
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'dot-separated',
      font: 'Times New Roman',
    },
    'modern': {
      nameAlign: AlignmentType.LEFT,
      nameUppercase: false,
      sectionHeadingUppercase: false,
      headingBorder: false,
      headingColor: '2563EB', // blue-600
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'comma',
      font: 'Arial',
    },
  };
  return configs[template] || configs['basic'];
};

/**
 * Generate a DOCX document from a resume object, respecting the selected template
 */
export const downloadResumeDocx = async (resume, filename = 'resume') => {
  try {
    const completeResume = resume || {};
    const template = completeResume.selectedTemplate || 'basic';
    const config = getTemplateConfig(template);

    debugLog('Resume data for DOCX export:', JSON.stringify(completeResume, null, 2));

    const personalInfo = completeResume.personalInfo || completeResume.personal_info || {};
    const workExperience = completeResume.workExperience || completeResume.work_experience || [];
    const education = completeResume.education || [];
    const skills = Array.isArray(completeResume.skills) ? completeResume.skills : [];
    const certifications = completeResume.certifications || [];
    const projects = completeResume.projects || [];

    // Use selected font or template default
    const docFont = completeResume.selectedFont || config.font;

    // Helper: create a section heading paragraph
    const createSectionHeading = (title) => {
      const headingText = config.sectionHeadingUppercase ? title.toUpperCase() : title;
      return new Paragraph({
        children: [
          new TextRun({
            text: headingText,
            bold: true,
            size: 28, // 14pt
            font: docFont,
            color: config.headingColor,
          }),
        ],
        spacing: { before: 360, after: 120 },
        border: config.headingBorder ? {
          bottom: {
            color: 'B0B0B0',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        } : undefined,
      });
    };

    // Helper: get skill text
    const getSkillText = (skill) => typeof skill === 'string' ? skill : (skill.name || skill.skill || '');

    // Build children array
    const children = [];

    // ======= NAME =======
    const nameText = config.nameUppercase
      ? (personalInfo.fullName || personalInfo.full_name || 'Full Name').toUpperCase()
      : (personalInfo.fullName || personalInfo.full_name || 'Full Name');

    children.push(new Paragraph({
      children: [
        new TextRun({
          text: nameText,
          bold: true,
          size: 32, // 16pt
          font: docFont,
        }),
      ],
      alignment: config.nameAlign,
      spacing: { after: 60 },
    }));

    // Job title (if present)
    if (personalInfo.jobTitle) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: personalInfo.jobTitle,
            size: 24,
            font: docFont,
            color: '555555',
          }),
        ],
        alignment: config.nameAlign,
        spacing: { after: 60 },
      }));
    }

    // Traditional: thick line under header
    if (config.headerThickLine) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        border: {
          bottom: {
            color: '1E1E1E',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 18,
          },
        },
      }));
    }

    // ======= CONTACT INFO =======
    const contactParts = [
      personalInfo.email || '',
      personalInfo.phone || '',
      personalInfo.location || '',
      (personalInfo.linkedin || personalInfo.professionalLinks?.linkedin) ?
        (personalInfo.linkedin || personalInfo.professionalLinks?.linkedin) : '',
    ].filter(Boolean);

    if (contactParts.length > 0) {
      children.push(new Paragraph({
        alignment: config.nameAlign,
        children: [
          new TextRun({
            text: contactParts.join('  |  '),
            size: 20, // 10pt
            font: docFont,
            color: '666666',
          }),
        ],
        spacing: { after: 200 },
      }));
    }

    // ======= PROFESSIONAL SUMMARY =======
    if (personalInfo.summary || personalInfo.professionalSummary) {
      children.push(createSectionHeading(config.sectionNames.summary));
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: personalInfo.summary || personalInfo.professionalSummary || '',
            size: 22,
            font: docFont,
          }),
        ],
        spacing: { after: 200 },
      }));
    }

    // ======= SKILLS =======
    if (skills.length > 0) {
      children.push(createSectionHeading(config.sectionNames.skills));

      if (config.skillsLayout === 'bullets') {
        // ATS-Friendly: bullet list
        skills.forEach(skill => {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: getSkillText(skill),
                size: 22,
                font: docFont,
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 40 },
          }));
        });
      } else if (config.skillsLayout === 'dot-separated') {
        // Minimalist / Traditional: dot-separated
        children.push(new Paragraph({
          children: [
            new TextRun({
              text: skills.map(getSkillText).join('  •  '),
              size: 22,
              font: docFont,
            }),
          ],
          spacing: { after: 200 },
        }));
      } else {
        // Basic / Modern: comma-separated
        children.push(new Paragraph({
          children: [
            new TextRun({
              text: skills.map(getSkillText).join(', '),
              size: 22,
              font: docFont,
            }),
          ],
          spacing: { after: 200 },
        }));
      }
    }

    // ======= WORK EXPERIENCE =======
    if (workExperience.length > 0) {
      children.push(createSectionHeading(config.sectionNames.experience));

      workExperience.forEach(job => {
        // Job title
        children.push(new Paragraph({
          children: [
            new TextRun({
              text: job.title || job.jobTitle || job.position || job.role || 'Job Title',
              bold: true,
              size: 24,
              font: docFont,
            }),
          ],
          spacing: { before: 200 },
        }));

        // Company + dates
        const companyText = job.company || job.companyName || job.employer || job.organization || 'Company';
        const startDate = job.startDate || job.start_date || job.from || '';
        const endDate = job.current || job.isCurrentRole || job.isCurrent ? 'Present' : (job.endDate || job.end_date || job.to || '');
        const locationText = job.location ? `, ${job.location}` : '';

        children.push(new Paragraph({
          children: [
            new TextRun({
              text: `${companyText}${locationText}  |  ${startDate} - ${endDate}`,
              italics: true,
              size: 20,
              font: docFont,
              color: template === 'modern' ? '2563EB' : '444444',
            }),
          ],
          spacing: { after: 100 },
        }));

        // Responsibilities
        if (job.responsibilities || job.description || job.achievements || job.duties) {
          const desc = (job.responsibilities || job.description || job.achievements || job.duties).toString().replace(/\\n/g, '\n');
          desc.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: trimmed.startsWith('•') ? trimmed.slice(1).trim() : trimmed,
                    size: 22,
                    font: docFont,
                  }),
                ],
                bullet: { level: 0 },
                spacing: { after: 40 },
              }));
            }
          });
        }
      });
    }

    // ======= EDUCATION =======
    if (education.length > 0) {
      children.push(createSectionHeading(config.sectionNames.education));

      education.forEach(edu => {
        const degree = edu.degree || edu.degreeType || edu.degreeName || '';
        const field = edu.fieldOfStudy || edu.field || edu.major || '';
        const degreeText = field ? `${degree} in ${field}` : (degree || 'Degree');

        children.push(new Paragraph({
          children: [
            new TextRun({
              text: degreeText,
              bold: true,
              size: 24,
              font: docFont,
            }),
          ],
          spacing: { before: 200 },
        }));

        const institution = edu.institution || edu.school || edu.university || edu.college || 'Institution';
        const startDate = edu.startDate || edu.start_date || edu.from || edu.yearStart || '';
        const endDate = edu.current || edu.isCurrentlyEnrolled ? 'Present' : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || '');

        children.push(new Paragraph({
          children: [
            new TextRun({
              text: `${institution}  |  ${startDate} - ${endDate}`,
              italics: true,
              size: 20,
              font: docFont,
              color: template === 'modern' ? '2563EB' : '444444',
            }),
          ],
          spacing: { after: 100 },
        }));

        if (edu.description || edu.details) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: edu.description || edu.details || '',
                size: 22,
                font: docFont,
              }),
            ],
            spacing: { after: 100 },
          }));
        }
      });
    }

    // ======= CERTIFICATIONS =======
    if (certifications.length > 0) {
      children.push(createSectionHeading(config.sectionNames.certifications));

      certifications.forEach(cert => {
        children.push(new Paragraph({
          children: [
            new TextRun({
              text: cert.name || cert.title || cert.certification || 'Certification',
              bold: true,
              size: 24,
              font: docFont,
            }),
          ],
          spacing: { before: 200 },
        }));

        const issuer = cert.issuer || cert.organization || cert.issuingOrganization || '';
        if (issuer) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: issuer,
                size: 22,
                font: docFont,
              }),
            ],
          }));
        }

        children.push(new Paragraph({
          children: [
            new TextRun({
              text: `Issue Date: ${cert.date || cert.issueDate || cert.year || 'Not Specified'}`,
              italics: true,
              size: 20,
              font: docFont,
              color: '666666',
            }),
          ],
          spacing: { after: 100 },
        }));
      });
    }

    // ======= PROJECTS =======
    if (projects.length > 0) {
      children.push(createSectionHeading(config.sectionNames.projects));

      projects.forEach(project => {
        const projectTitle = project.name || project.title || project.projectName ||
          (project.description && project.description.split('\n')[0]?.trim().split('.')[0]) ||
          'Project Name';

        children.push(new Paragraph({
          children: [
            new TextRun({
              text: projectTitle,
              bold: true,
              size: 24,
              font: docFont,
            }),
          ],
          spacing: { before: 200 },
        }));

        // Date
        let dateText = '';
        if (project.date || project.duration || project.timeframe || project.period) {
          dateText = project.date || project.duration || project.timeframe || project.period;
        } else if (project.startDate || project.start_date || project.endDate || project.end_date) {
          const s = project.startDate || project.start_date || '';
          const e = project.current || project.isCurrentProject ? 'Present' : (project.endDate || project.end_date || '');
          if (s || e) dateText = s + (s && e ? ' - ' : '') + e;
        }

        if (dateText) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: dateText,
                italics: true,
                size: 20,
                font: docFont,
                color: '666666',
              }),
            ],
          }));
        }

        // Description
        const desc = project.description || project.details || project.summary;
        if (desc) {
          desc.toString().split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: trimmed.startsWith('•') ? trimmed.slice(1).trim() : trimmed,
                    size: 22,
                    font: docFont,
                  }),
                ],
                bullet: { level: 0 },
                spacing: { after: 40 },
              }));
            }
          });
        }

        // Technologies
        const tech = project.technologies || project.techStack || project.tools;
        if (tech) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: `Technologies: ${tech}`,
                italics: true,
                size: 20,
                font: docFont,
                color: '666666',
              }),
            ],
            spacing: { after: 100 },
          }));
        }
      });
    }

    // ======= CREATE DOCUMENT =======
    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: {
              size: 22,
              font: docFont,
            },
            paragraph: {
              spacing: { line: 276 },
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children,
        },
      ],
    });

    // Export
    const cleanName = (filename || 'resume')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    if (isBrowser) {
      try {
        debugLog('Using browser-compatible Packer.toBlob method');
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${cleanName}.docx`);
      } catch (browserError) {
        console.error('Error with Packer.toBlob:', browserError);
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
      await Packer.toBuffer(doc);
    }

    return true;
  } catch (error) {
    console.error('Error generating or downloading DOCX:', error);
    throw new Error(`Failed to export resume as DOCX: ${error.message}`);
  }
};
