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
      skillsLayout: 'bullets-columns',
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
      headerLine: true,
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
      headerBg: true,
      sectionHeadingUppercase: false,
      sectionUnderline: false,
      headingColor: [37, 99, 235],
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

    // Use selected font or fallback — jsPDF only has helvetica, times, courier
    const selectedFont = completeResume.selectedFont || 'Arial';
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

    // ─── Helpers ───────────────────────────────────────────────

    /**
     * Add text with word wrapping. Returns the Y coordinate for the
     * NEXT element (i.e. below the text that was just drawn, with a
     * small descent buffer so lines/content won't overlap).
     *
     * jsPDF draws text at the BASELINE. For a 12 pt font the baseline
     * sits ~3.2 mm below the top of the glyphs and ~1 mm above the
     * bottom of descenders. We use getTextDimensions().h (= font size
     * in mm, WITHOUT the line-spacing multiplier) to compute a tight
     * bounding box, then add a 30 % descent buffer.
     */
    const addText = (text, x, currentY, options = {}) => {
      const {
        fontSize = config.bodyFontSize,
        fontStyle = 'normal',
        align = 'left',
        maxWidth = contentWidth,
        color = [51, 51, 51],
      } = options;

      pdf.setFontSize(fontSize);
      pdf.setFont(pdfFont, fontStyle);
      pdf.setTextColor(...color);

      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.text(lines, x, currentY, { align });

      // h = font size in mm (the em-square height)
      const { h } = pdf.getTextDimensions('Xg');
      // Each line occupies h * lineHeightFactor. For n lines the total
      // span from the first baseline to just below the last line is:
      //   (n-1) * lineSpacing  +  descent
      // But it's simpler (and safe) to just use n * lineSpacing and add
      // a small buffer for the descenders of the last line.
      const lineSpacing = h * pdf.getLineHeightFactor();
      const descent = h * 0.25; // approximate descender depth
      return currentY + (lines.length * lineSpacing) + descent;
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

    const checkNewPage = (yPosition, minSpace = 20) => {
      if (yPosition + minSpace > pageHeight - margin) {
        pdf.addPage();
        return margin;
      }
      return yPosition;
    };

    /**
     * Draw a section heading. The heading is bold text, optionally
     * coloured, with an optional thin separator line underneath.
     * NO accent lines, NO decorations that can overlap with text.
     */
    const addSectionHeading = (title, currentY) => {
      currentY = checkNewPage(currentY);
      currentY += 5; // gap before heading

      const headingText = config.sectionHeadingUppercase ? title.toUpperCase() : title;

      currentY = addText(headingText, margin, currentY, {
        fontSize: config.sectionFontSize,
        fontStyle: 'bold',
        color: config.headingColor,
      });

      // currentY is now safely below the heading text (including descenders)
      if (config.sectionUnderline) {
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.2);
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 1.5;
      }

      currentY += 1; // small gap after heading
      return currentY;
    };

    /** Render bullet points from a description string */
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

          const { h } = pdf.getTextDimensions('Xg');
          const lineSpacing = h * pdf.getLineHeightFactor();
          currentY += (bulletLines.length * lineSpacing) + (h * 0.25);
          currentY += 0.5;
        }
      });

      return currentY;
    };

    // ─── HEADER ───────────────────────────────────────────────

    // Modern template: light blue background on header area
    if (config.headerBg) {
      pdf.setFillColor(239, 246, 255);
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

    // Job title
    if (personalInfo.jobTitle) {
      y = addText(personalInfo.jobTitle, nameX, y, {
        fontSize: config.bodyFontSize + 1,
        align: config.nameAlign,
        color: [80, 80, 80],
      });
    }

    // Traditional template: thick line under header
    if (config.headerLine) {
      y += 1;
      pdf.setDrawColor(30, 30, 30);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 2;
    }

    // Contact information
    const contactParts = [];
    if (personalInfo.email) contactParts.push(personalInfo.email);
    if (personalInfo.phone) contactParts.push(personalInfo.phone);
    if (personalInfo.location) contactParts.push(personalInfo.location);
    if (personalInfo.linkedin) contactParts.push(personalInfo.linkedin);

    if (contactParts.length > 0) {
      y += 1;
      const contactX = config.contactAlign === 'center' ? pageWidth / 2 : margin;
      y = addText(contactParts.join(config.contactSeparator), contactX, y, {
        fontSize: config.bodyFontSize,
        align: config.contactAlign,
        color: [80, 80, 80],
      });
      y += 2;
    }

    // ─── PROFESSIONAL SUMMARY ─────────────────────────────────
    if (personalInfo.summary) {
      y = addSectionHeading(config.sectionNames.summary, y);
      y = addText(personalInfo.summary, margin, y, {
        fontSize: config.smallFontSize,
      });
      y += 1;
    }

    // ─── SKILLS ───────────────────────────────────────────────
    if (skills && skills.length > 0) {
      y = addSectionHeading(config.sectionNames.skills, y);

      const getSkillText = (skill) =>
        typeof skill === 'string' ? skill : (skill.name || skill.skill || '');

      if (config.skillsLayout === 'bullets-columns') {
        const skillsPerColumn = Math.ceil(skills.length / 3);
        const col1 = skills.slice(0, skillsPerColumn);
        const col2 = skills.slice(skillsPerColumn, skillsPerColumn * 2);
        const col3 = skills.slice(skillsPerColumn * 2);

        const columnWidth = contentWidth / 3;

        let col1Y = y, col2Y = y, col3Y = y;

        col1.forEach(skill => {
          col1Y = addText(`• ${getSkillText(skill)}`, margin, col1Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });
        col2.forEach(skill => {
          col2Y = addText(`• ${getSkillText(skill)}`, margin + columnWidth, col2Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });
        col3.forEach(skill => {
          col3Y = addText(`• ${getSkillText(skill)}`, margin + (columnWidth * 2), col3Y, {
            fontSize: config.bodyFontSize,
            maxWidth: columnWidth - 5
          });
        });

        y = Math.max(col1Y, col2Y, col3Y);
      } else if (config.skillsLayout === 'dot-separated') {
        const skillStr = skills.map(getSkillText).join('  •  ');
        y = addText(skillStr, margin, y, { fontSize: config.bodyFontSize });
      } else {
        const skillStr = skills.map(getSkillText).join(', ');
        y = addText(skillStr, margin, y, { fontSize: config.bodyFontSize });
      }

      y += 1;
    }

    // ─── WORK EXPERIENCE ──────────────────────────────────────
    if (workExperience && workExperience.length > 0) {
      y = addSectionHeading(config.sectionNames.experience, y);

      workExperience.forEach(job => {
        y = checkNewPage(y);

        y = addText(
          job.title || job.jobTitle || job.position || job.role || '',
          margin, y,
          { fontSize: config.bodyFontSize + 1, fontStyle: 'bold', color: [0, 0, 0] }
        );

        const companyText = (job.company || job.companyName || job.employer || job.organization || '') +
          (job.location ? `, ${job.location}` : '');
        y = addText(companyText, margin, y, {
          fontSize: config.bodyFontSize,
          color: template === 'modern' ? [37, 99, 235] : [51, 51, 51],
        });

        const startDate = job.startDate || job.start_date || job.from || '';
        const endDate = job.current || job.isCurrentRole || job.isCurrent
          ? 'Present'
          : (job.endDate || job.end_date || job.to || '');
        y = addText(`${startDate} - ${endDate}`, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        y += 1;

        if (job.responsibilities || job.description || job.achievements || job.duties) {
          y = addBulletPoints(
            job.responsibilities || job.description || job.achievements || job.duties,
            y
          );
        }

        y += 2;
      });
    }

    // ─── EDUCATION ────────────────────────────────────────────
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
        const endDate = edu.current || edu.isCurrentlyEnrolled
          ? 'Present'
          : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || '');
        y = addText(`${startDate} - ${endDate}`, margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        if (edu.description) {
          y += 1;
          y = addText(edu.description, margin, y, { fontSize: config.smallFontSize });
        }

        y += 2;
      });
    }

    // ─── CERTIFICATIONS ───────────────────────────────────────
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
        y = addText(certDate ? `Issue Date: ${certDate}` : 'Issue Date: Not Specified', margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        y += 2;
      });
    }

    // ─── PROJECTS ─────────────────────────────────────────────
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

        // Date
        let projectDateValue = null;
        if (project.date || project.duration || project.timeframe || project.period) {
          projectDateValue = project.date || project.duration || project.timeframe || project.period;
        } else if (project.startDate || project.start_date || project.endDate || project.end_date) {
          const s = project.startDate || project.start_date || '';
          const e = project.current || project.isCurrentProject
            ? 'Present'
            : (project.endDate || project.end_date || '');
          if (s || e) projectDateValue = s + (s && e ? ' - ' : '') + e;
        }

        y = addText(projectDateValue || 'Completion Date: Not Specified', margin, y, {
          fontSize: config.smallFontSize,
          fontStyle: 'italic',
          color: [100, 100, 100],
        });

        const projectDescription = project.description || project.details || project.summary;
        if (projectDescription) {
          y += 1;
          y = addBulletPoints(projectDescription, y);
        }

        const technologies = project.technologies || project.techStack || project.tools || project.tech;
        if (technologies) {
          y = addText(`Technologies: ${technologies}`, margin, y, {
            fontSize: config.smallFontSize,
            fontStyle: 'italic',
            color: [100, 100, 100],
          });
        }

        y += 2;
      });
    }

    // ─── SAVE ─────────────────────────────────────────────────
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
