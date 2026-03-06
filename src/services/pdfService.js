import { jsPDF } from 'jspdf';

/**
 * Template-specific configuration for PDF export
 */
const getTemplateConfig = (template) => {
  const configs = {
    'ats-friendly': {
      nameAlign: 'center',
      nameUppercase: false,
      headerLine: false,
      sectionHeadingUppercase: false,
      sectionUnderline: true,
      headingColor: [0, 0, 0],
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Core Competencies',
        experience: 'Professional Experience',
        education: 'Education',
        certifications: 'Certifications & Licenses',
        projects: 'Additional Projects',
      },
      skillsLayout: 'bullets-columns', // 3-column bullet list
      contactSeparator: ' | ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
    },
    'basic': {
      nameAlign: 'center',
      nameUppercase: false,
      headerLine: false,
      sectionHeadingUppercase: false,
      sectionUnderline: true,
      headingColor: [0, 0, 0],
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'comma-list',
      contactSeparator: '  |  ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
    },
    'minimalist': {
      nameAlign: 'left',
      nameUppercase: false,
      headerLine: false,
      sectionHeadingUppercase: true,
      sectionUnderline: false,
      headingColor: [0, 0, 0],
      sectionNames: {
        summary: 'Summary',
        skills: 'Skills',
        experience: 'Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'dot-separated',
      contactSeparator: '  |  ',
      contactAlign: 'left',
      nameFontSize: 16,
      sectionFontSize: 11,
      bodyFontSize: 9,
      smallFontSize: 8,
    },
    'traditional': {
      nameAlign: 'center',
      nameUppercase: true,
      headerLine: true, // thick line under header
      sectionHeadingUppercase: true,
      sectionUnderline: false,
      headingColor: [0, 0, 0],
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'dot-separated',
      contactSeparator: '  |  ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
    },
    'modern': {
      nameAlign: 'left',
      nameUppercase: false,
      headerLine: false,
      headerBg: true, // light blue background on header
      sectionHeadingUppercase: false,
      sectionUnderline: false,
      sectionAccentLine: true, // blue line before heading
      headingColor: [37, 99, 235], // blue-600
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      skillsLayout: 'comma-list',
      contactSeparator: '  |  ',
      contactAlign: 'left',
      contactIcons: true,
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
    },
  };
  return configs[template] || configs['basic'];
};

/**
 * Generate a text-based PDF from a resume object, respecting the selected template
 */
export const downloadResumePdf = (resume, filename = 'resume') => {
  try {
    const completeResume = resume || {};
    const template = completeResume.selectedTemplate || 'basic';
    const config = getTemplateConfig(template);

    const {
      personalInfo = {},
      workExperience = [],
      education = [],
      skills = [],
      certifications = [],
      projects = []
    } = completeResume;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Use selected font or fallback
    const selectedFont = completeResume.selectedFont || 'Arial';
    // jsPDF only has helvetica, times, courier built in
    const fontMap = {
      'Arial': 'helvetica',
      'Helvetica': 'helvetica',
      'Calibri': 'helvetica',
      'Times New Roman': 'times',
      'Garamond': 'times',
      'Georgia': 'times',
      'Lora': 'times',
      'Roboto': 'helvetica',
      'Ubuntu': 'helvetica',
    };
    const pdfFont = fontMap[selectedFont] || 'helvetica';
    pdf.setFont(pdfFont);

    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - (margin * 2);

    let y = margin;

    // Helper: add text with word wrapping
    const addText = (text, x, currentY, options = {}) => {
      const {
        fontSize = config.bodyFontSize,
        fontStyle = 'normal',
        align = 'left',
        lineHeight = 1.2,
        maxWidth = contentWidth,
        color = [51, 51, 51],
      } = options;

      pdf.setFontSize(fontSize);
      pdf.setFont(pdfFont, fontStyle);
      pdf.setTextColor(...color);

      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.text(lines, x, currentY, { align });

      return currentY + (lines.length * fontSize * 0.352778 * lineHeight);
    };

    const normalizeTextBlock = (value) => {
      if (Array.isArray(value)) {
        return value
          .map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return item.text || item.description || item.value || '';
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        return value.text || value.description || value.value || '';
      }
      return '';
    };

    // Helper: check if we need a new page
    const checkNewPage = (yPosition, minSpace = 20) => {
      if (yPosition + minSpace > pageHeight - margin) {
        pdf.addPage();
        return margin;
      }
      return yPosition;
    };

    // Helper: draw a section heading based on template config
    const addSectionHeading = (title, currentY) => {
      currentY = checkNewPage(currentY);
      currentY += 5;

      const headingText = config.sectionHeadingUppercase ? title.toUpperCase() : title;

      if (config.sectionAccentLine) {
        // Modern: draw a blue line before the heading
        pdf.setDrawColor(...config.headingColor);
        pdf.setLineWidth(0.5);
        pdf.line(margin, currentY - 1, margin + 12, currentY - 1);
      }

      const headingX = config.nameAlign === 'left' ? margin : margin;
      currentY = addText(headingText, headingX, currentY, {
        fontSize: config.sectionFontSize,
        fontStyle: 'bold',
        color: config.headingColor,
      });

      if (config.sectionUnderline) {
        // Draw a thin line under the heading
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.3);
        pdf.line(margin, currentY + 0.5, pageWidth - margin, currentY + 0.5);
        currentY += 2;
      }

      currentY += 3;
      return currentY;
    };

    // Helper: render bullet points from a description
    const addBulletPoints = (description, currentY) => {
      const jobDescription = normalizeTextBlock(description);
      const bulletPoints = jobDescription.replace(/\\n/g, '\n').split('\n');

      bulletPoints.forEach(point => {
        if (point.trim()) {
          currentY = checkNewPage(currentY);
          const bulletText = point.trim().startsWith('•') ? point.trim() : `• ${point.trim()}`;

          pdf.setFontSize(config.smallFontSize);
          pdf.setFont(pdfFont, 'normal');
          pdf.setTextColor(51, 51, 51);

          const bulletLines = pdf.splitTextToSize(bulletText, contentWidth - 10);
          pdf.text(bulletLines, margin + 5, currentY);
          currentY += (bulletLines.length * config.smallFontSize * 0.352778 * 1.2);
          currentY += 1;
        }
      });

      return currentY;
    };

    // ======= HEADER =======

    // Modern template: blue background header
    if (config.headerBg) {
      pdf.setFillColor(239, 246, 255); // blue-50
      pdf.rect(0, 0, pageWidth, 35, 'F');
    }

    // Name
    const nameText = config.nameUppercase
      ? (personalInfo.fullName || 'Your Name').toUpperCase()
      : (personalInfo.fullName || 'Your Name');

    const nameX = config.nameAlign === 'center' ? pageWidth / 2 : margin;
    y = addText(nameText, nameX, y, {
      fontSize: config.nameFontSize,
      fontStyle: 'bold',
      align: config.nameAlign,
      color: [0, 0, 0],
    });

    // Job title (if present)
    if (personalInfo.jobTitle) {
      y += 1;
      y = addText(personalInfo.jobTitle, nameX, y, {
        fontSize: config.bodyFontSize + 1,
        align: config.nameAlign,
        color: [80, 80, 80],
      });
    }

    // Traditional template: thick line under header
    if (config.headerLine) {
      y += 2;
      pdf.setDrawColor(30, 30, 30);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 3;
    }

    // Contact information
    const contactParts = [];
    if (config.contactIcons) {
      if (personalInfo.email) contactParts.push(personalInfo.email);
      if (personalInfo.phone) contactParts.push(personalInfo.phone);
      if (personalInfo.location) contactParts.push(personalInfo.location);
      if (personalInfo.linkedin) contactParts.push(personalInfo.linkedin);
    } else {
      if (personalInfo.email) contactParts.push(personalInfo.email);
      if (personalInfo.phone) contactParts.push(personalInfo.phone);
      if (personalInfo.location) contactParts.push(personalInfo.location);
      if (personalInfo.linkedin) contactParts.push(personalInfo.linkedin);
    }

    if (contactParts.length > 0) {
      y += 3;
      const contactX = config.contactAlign === 'center' ? pageWidth / 2 : margin;
      y = addText(contactParts.join(config.contactSeparator), contactX, y, {
        fontSize: config.bodyFontSize,
        align: config.contactAlign,
        color: [80, 80, 80],
      });
      y += 4;
    }

    // ======= PROFESSIONAL SUMMARY =======
    if (personalInfo.summary) {
      y = addSectionHeading(config.sectionNames.summary, y);
      pdf.setFontSize(config.smallFontSize);
      pdf.setFont(pdfFont, 'normal');
      pdf.setTextColor(51, 51, 51);
      const summaryLines = pdf.splitTextToSize(personalInfo.summary, contentWidth);
      pdf.text(summaryLines, margin, y);
      y += (summaryLines.length * config.smallFontSize * 0.352778 * 1.1);
      y += 3;
    }

    // ======= SKILLS =======
    if (skills && skills.length > 0) {
      y = addSectionHeading(config.sectionNames.skills, y);

      const getSkillText = (skill) => typeof skill === 'string' ? skill : (skill.name || skill.skill || '');

      if (config.skillsLayout === 'bullets-columns') {
        // ATS-Friendly: 3-column bullet list
        const skillsPerColumn = Math.ceil(skills.length / 3);
        const col1 = skills.slice(0, skillsPerColumn);
        const col2 = skills.slice(skillsPerColumn, skillsPerColumn * 2);
        const col3 = skills.slice(skillsPerColumn * 2);

        const columnWidth = contentWidth / 3;
        const col1X = margin;
        const col2X = margin + columnWidth;
        const col3X = margin + (columnWidth * 2);

        let col1Y = y, col2Y = y, col3Y = y;

        col1.forEach(skill => {
          col1Y = addText(`• ${getSkillText(skill)}`, col1X, col1Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });
        col2.forEach(skill => {
          col2Y = addText(`• ${getSkillText(skill)}`, col2X, col2Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });
        col3.forEach(skill => {
          col3Y = addText(`• ${getSkillText(skill)}`, col3X, col3Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });

        y = Math.max(col1Y, col2Y, col3Y);
      } else if (config.skillsLayout === 'dot-separated') {
        // Minimalist / Traditional: dot-separated inline
        const skillStr = skills.map(getSkillText).join('  •  ');
        y = addText(skillStr, margin, y, { fontSize: config.bodyFontSize });
      } else {
        // Basic / Modern: comma-separated
        const skillStr = skills.map(getSkillText).join(', ');
        y = addText(skillStr, margin, y, { fontSize: config.bodyFontSize });
      }

      y += 3;
    }

    // ======= WORK EXPERIENCE =======
    if (workExperience && workExperience.length > 0) {
      y = addSectionHeading(config.sectionNames.experience, y);

      workExperience.forEach(job => {
        y = checkNewPage(y);

        // Job title
        y = addText(
          job.title || job.jobTitle || job.position || job.role || '',
          margin, y,
          { fontSize: config.bodyFontSize + 1, fontStyle: 'bold', color: [0, 0, 0] }
        );

        // Company
        const companyText = (job.company || job.companyName || job.employer || job.organization || '') +
          (job.location ? `, ${job.location}` : '');
        y = addText(companyText, margin, y, {
          fontSize: config.bodyFontSize,
          color: template === 'modern' ? [37, 99, 235] : [51, 51, 51],
        });

        // Dates
        const startDate = job.startDate || job.start_date || job.from || '';
        const endDate = job.current || job.isCurrentRole || job.isCurrent ? 'Present' : (job.endDate || job.end_date || job.to || '');
        const dateText = `${startDate} - ${endDate}`;
        y = addText(dateText, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        y += 2;

        // Description / bullet points
        if (job.responsibilities || job.description || job.achievements || job.duties) {
          y = addBulletPoints(
            job.responsibilities || job.description || job.achievements || job.duties,
            y
          );
        }

        y += 4;
      });
    }

    // ======= EDUCATION =======
    if (education && education.length > 0) {
      y = addSectionHeading(config.sectionNames.education, y);

      education.forEach(edu => {
        y = checkNewPage(y);

        const degree = edu.degree || edu.degreeType || edu.degreeName || edu.degreeLevel || '';
        const field = edu.fieldOfStudy || edu.field || edu.major || '';
        const degreeInfo = field ? `${degree} in ${field}` : degree;

        y = addText(degreeInfo, margin, y, {
          fontSize: config.bodyFontSize + 1,
          fontStyle: 'bold',
          color: [0, 0, 0],
        });

        const institution = edu.institution || edu.school || edu.university || edu.college || 'Institution';
        y = addText(institution, margin, y, {
          fontSize: config.bodyFontSize,
          color: template === 'modern' ? [37, 99, 235] : [51, 51, 51],
        });

        const startDate = edu.startDate || edu.start_date || edu.from || edu.yearStart || '';
        const endDate = edu.current || edu.isCurrentlyEnrolled ? 'Present' : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || '');
        const dateText = `${startDate} - ${endDate}`;
        y = addText(dateText, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        if (edu.description) {
          y += 2;
          y = addText(edu.description, margin, y, { fontSize: config.smallFontSize });
        }

        y += 4;
      });
    }

    // ======= CERTIFICATIONS =======
    if (certifications && certifications.length > 0) {
      y = addSectionHeading(config.sectionNames.certifications, y);

      certifications.forEach(cert => {
        y = checkNewPage(y);

        const certName = cert.name || cert.title || cert.certification || cert.certificationName || 'Certification';
        y = addText(certName, margin, y, {
          fontSize: config.bodyFontSize + 1,
          fontStyle: 'bold',
          color: [0, 0, 0],
        });

        const issuer = cert.issuer || cert.organization || cert.issuingOrganization || cert.provider || cert.authority;
        if (issuer) {
          y = addText(issuer, margin, y, {
            fontSize: config.bodyFontSize,
            color: template === 'modern' ? [37, 99, 235] : [51, 51, 51],
          });
        }

        const certDate = cert.date || cert.issueDate || cert.year || cert.issuedDate || cert.dateIssued;
        const dateText = certDate ? `Issue Date: ${certDate}` : 'Issue Date: Not Specified';
        y = addText(dateText, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        y += 4;
      });
    }

    // ======= PROJECTS =======
    if (projects && projects.length > 0) {
      y = addSectionHeading(config.sectionNames.projects, y);

      projects.forEach(project => {
        y = checkNewPage(y);

        const projectTitle = project.name || project.title || project.projectName ||
          (project.description && project.description.split('\n')[0]?.trim().split('.')[0]) ||
          'Project Name';

        y = addText(projectTitle, margin, y, {
          fontSize: config.bodyFontSize + 1,
          fontStyle: 'bold',
          color: [0, 0, 0],
        });

        // Project date
        let projectDateValue = null;
        if (project.date || project.duration || project.timeframe || project.period) {
          projectDateValue = project.date || project.duration || project.timeframe || project.period;
        } else if (project.startDate || project.start_date || project.endDate || project.end_date) {
          const startDate = project.startDate || project.start_date || '';
          const endDate = project.current || project.isCurrentProject ? 'Present' : (project.endDate || project.end_date || '');
          if (startDate || endDate) {
            projectDateValue = startDate + (startDate && endDate ? ' - ' : '') + endDate;
          }
        }

        const projectDate = projectDateValue || 'Completion Date: Not Specified';
        y = addText(projectDate, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        // Description
        const projectDescription = project.description || project.details || project.summary;
        if (projectDescription) {
          y += 2;
          y = addBulletPoints(projectDescription, y);
        }

        // Technologies
        const technologies = project.technologies || project.techStack || project.tools || project.tech;
        if (technologies) {
          y += 1;
          y = addText(`Technologies: ${technologies}`, margin, y, {
            fontSize: config.smallFontSize,
            fontStyle: 'italic',
            color: [100, 100, 100],
          });
        }

        y += 4;
      });
    }

    // Save the PDF
    const cleanName = (filename || 'resume')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    pdf.save(`${cleanName}.pdf`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
