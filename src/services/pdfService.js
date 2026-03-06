import { jsPDF } from 'jspdf';

/**
 * Template configurations that mirror the React preview templates.
 */
const getTemplateConfig = (template) => {
  const configs = {
    'ats-friendly': {
      nameAlign: 'center',
      nameUppercase: false,
      headerLine: false,
      sectionUnderline: true,
      headingColor: [0, 0, 0],
      headingPrefix: '',
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Core Competencies',
        experience: 'Professional Experience',
        education: 'Education',
        certifications: 'Certifications & Licenses',
        projects: 'Additional Projects',
      },
      // ATS puts skills BEFORE experience
      sectionOrder: ['summary', 'skills', 'experience', 'education', 'certifications', 'projects'],
      skillsLayout: 'bullets-columns',
      contactSeparator: ' | ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
      companyColor: [51, 51, 51],
    },
    'basic': {
      nameAlign: 'center',
      nameUppercase: false,
      headerLine: false,
      sectionUnderline: true,
      headingColor: [0, 0, 0],
      headingPrefix: '',
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'certifications', 'projects'],
      skillsLayout: 'comma-list',
      contactSeparator: '    ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
      companyColor: [51, 51, 51],
    },
    'minimalist': {
      nameAlign: 'left',
      nameUppercase: false,
      headerLine: false,
      sectionUnderline: false,
      sectionHeadingUppercase: true,
      headingColor: [0, 0, 0],
      headingPrefix: '',
      sectionNames: {
        summary: 'Summary',
        skills: 'Skills',
        experience: 'Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'certifications', 'projects'],
      skillsLayout: 'dot-separated',
      contactSeparator: '    ',
      contactAlign: 'left',
      nameFontSize: 16,
      sectionFontSize: 11,
      bodyFontSize: 9,
      smallFontSize: 8,
      companyColor: [51, 51, 51],
    },
    'traditional': {
      nameAlign: 'center',
      nameUppercase: true,
      headerLine: true,
      sectionUnderline: false,
      sectionHeadingUppercase: true,
      headingColor: [0, 0, 0],
      headingPrefix: '',
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'certifications', 'projects'],
      skillsLayout: 'dot-separated',
      contactSeparator: '    ',
      contactAlign: 'center',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
      companyColor: [51, 51, 51],
    },
    'modern': {
      nameAlign: 'left',
      nameUppercase: false,
      headerLine: false,
      headerBg: true,
      sectionUnderline: false,
      headingColor: [37, 99, 235],
      // The "— " prefix replicates the blue dash accent in the React preview
      headingPrefix: '\u2014  ',
      contactIcons: true,
      sectionNames: {
        summary: 'Professional Summary',
        skills: 'Skills',
        experience: 'Work Experience',
        education: 'Education',
        certifications: 'Certifications',
        projects: 'Projects',
      },
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'certifications', 'projects'],
      skillsLayout: 'comma-list',
      contactSeparator: '    ',
      contactAlign: 'left',
      nameFontSize: 16,
      sectionFontSize: 12,
      bodyFontSize: 10,
      smallFontSize: 9,
      companyColor: [37, 99, 235],
    },
  };
  return configs[template] || configs['basic'];
};

/**
 * Generate a text-based PDF that matches the React preview template.
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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const selectedFont = completeResume.selectedFont || 'Arial';
    const fontMap = {
      'Arial': 'helvetica', 'Helvetica': 'helvetica', 'Calibri': 'helvetica',
      'Times New Roman': 'times', 'Garamond': 'times', 'Georgia': 'times',
      'Lora': 'times', 'Roboto': 'helvetica', 'Ubuntu': 'helvetica',
    };
    const pdfFont = fontMap[selectedFont] || 'helvetica';
    pdf.setFont(pdfFont);

    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - (margin * 2);

    let y = margin;

    // ─── Helpers ───────────────────────────────────────────────

    /** Measure text height for current font settings (descenders included) */
    const textHeight = () => {
      const { h } = pdf.getTextDimensions('Xgj');
      return h;
    };

    /**
     * Draw text and return Y below it (accounting for descenders).
     * This is the ONLY function that advances Y — every other helper
     * delegates here so line positioning is consistent.
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

      const h = textHeight();
      const lineSpacing = h * pdf.getLineHeightFactor();
      const descent = h * 0.25;
      return currentY + (lines.length * lineSpacing) + descent;
    };

    /** Draw text at a position WITHOUT advancing Y (for side-by-side layout) */
    const drawText = (text, x, currentY, options = {}) => {
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
    };

    const normalizeTextBlock = (value) => {
      if (Array.isArray(value)) {
        return value.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') return item.text || item.description || item.value || '';
          return '';
        }).filter(Boolean).join('\n');
      }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') return value.text || value.description || value.value || '';
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
     * Section heading — matches each template's heading style:
     *  - Modern: "— Professional Summary" in blue, no underline
     *  - Basic/ATS: "Professional Summary" with gray underline
     *  - Minimalist: "SUMMARY" no underline
     *  - Traditional: "PROFESSIONAL SUMMARY" no underline
     */
    const addSectionHeading = (title, currentY) => {
      currentY = checkNewPage(currentY);
      currentY += 5;

      let headingText = config.sectionHeadingUppercase ? title.toUpperCase() : title;
      if (config.headingPrefix) {
        headingText = config.headingPrefix + headingText;
      }

      currentY = addText(headingText, margin, currentY, {
        fontSize: config.sectionFontSize,
        fontStyle: 'bold',
        color: config.headingColor,
      });

      if (config.sectionUnderline) {
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.2);
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 1.5;
      }

      currentY += 1;
      return currentY;
    };

    /**
     * Draw a job/education entry with title LEFT and date RIGHT on the same line.
     * This mirrors the "flex justify-between" layout in the React previews.
     */
    const addEntryHeader = (titleText, dateText, currentY, options = {}) => {
      const {
        titleFontSize = config.bodyFontSize + 1,
        titleColor = [0, 0, 0],
      } = options;

      // Draw title on the left
      pdf.setFontSize(titleFontSize);
      pdf.setFont(pdfFont, 'bold');
      pdf.setTextColor(...titleColor);
      pdf.text(titleText, margin, currentY);

      // Draw date on the right
      if (dateText) {
        pdf.setFontSize(config.smallFontSize);
        pdf.setFont(pdfFont, 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(dateText, pageWidth - margin, currentY, { align: 'right' });
      }

      // Advance Y based on the title (the taller element)
      pdf.setFontSize(titleFontSize);
      const h = textHeight();
      return currentY + (h * pdf.getLineHeightFactor()) + (h * 0.25);
    };

    /** Render bullet points from a description string */
    const addBulletPoints = (description, currentY) => {
      const text = normalizeTextBlock(description);
      const points = text.replace(/\\n/g, '\n').split('\n');

      points.forEach(point => {
        if (point.trim()) {
          currentY = checkNewPage(currentY);
          const bulletText = point.trim().startsWith('•') ? point.trim() : `• ${point.trim()}`;
          currentY = addText(bulletText, margin + 3, currentY, {
            fontSize: config.smallFontSize,
            maxWidth: contentWidth - 6,
          });
          currentY += 0.3;
        }
      });
      return currentY;
    };

    /** Render description as flowing text (for Modern template) */
    const addFlowingText = (description, currentY) => {
      const text = normalizeTextBlock(description);
      // Join all lines into a single paragraph
      const paragraph = text.replace(/\\n/g, ' ').replace(/\n/g, ' ')
        .replace(/\s*•\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (paragraph) {
        currentY = addText(paragraph, margin, currentY, {
          fontSize: config.smallFontSize,
        });
      }
      return currentY;
    };

    // ─── HEADER ───────────────────────────────────────────────

    // For Modern template we draw the blue background AFTER laying out
    // header content so we know exactly how tall it is. We use a two-
    // pass trick: first render header content (which advances y), then
    // draw the bg rectangle behind the content on the same page.

    const headerStartY = y;

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

    // Contact information
    if (config.contactIcons) {
      // Modern: build contact string with simple text-based icons
      // (jsPDF built-in fonts can't render emoji, so use clean labels)
      const parts = [];
      if (personalInfo.email) parts.push('E: ' + personalInfo.email);
      if (personalInfo.phone) parts.push('P: ' + personalInfo.phone);
      if (personalInfo.location) parts.push('L: ' + personalInfo.location);
      if (personalInfo.linkedin) parts.push(personalInfo.linkedin);
      if (parts.length > 0) {
        y += 1;
        y = addText(parts.join('   |   '), margin, y, {
          fontSize: config.smallFontSize,
          color: [100, 100, 100],
        });
      }
    } else {
      const parts = [];
      if (personalInfo.email) parts.push(personalInfo.email);
      if (personalInfo.phone) parts.push(personalInfo.phone);
      if (personalInfo.location) parts.push(personalInfo.location);
      if (personalInfo.linkedin) parts.push(personalInfo.linkedin);
      if (parts.length > 0) {
        y += 1;
        const contactX = config.contactAlign === 'center' ? pageWidth / 2 : margin;
        y = addText(parts.join(config.contactSeparator), contactX, y, {
          fontSize: config.bodyFontSize,
          align: config.contactAlign,
          color: [80, 80, 80],
        });
      }
    }

    // Now draw Modern header background BEHIND the content we just rendered.
    // We add the filled rect first on the page (it will be behind text in
    // the PDF render order because jsPDF doesn't layer — BUT we can work
    // around this by creating a new page, drawing bg, then re-drawing text).
    // Simpler approach: use pdf.setPage() isn't needed — instead we just
    // accept that we need to draw bg first. Let's use a pre-calculated height.
    //
    // Actually, the simplest reliable approach: draw the bg rect FIRST with a
    // generous height, then overlay the text on top. Since we already drew text,
    // we need to redo. Let's track the header end Y and redraw.
    if (config.headerBg) {
      const headerEndY = y + 3; // small padding
      // Save current page content by using the internal API
      // Unfortunately jsPDF doesn't support z-ordering, so we need to
      // draw bg on a fresh doc and merge. The pragmatic solution:
      // insert the bg rect at the START of the page content stream.
      //
      // Workaround: We'll add a white rect to "erase" and redraw.
      // But the cleanest approach that actually works in jsPDF is
      // to simply accept the bg was drawn first. Let's redraw the header.

      // Erase area with white first, then draw blue bg, then redraw text
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, headerEndY, 'F');
      pdf.setFillColor(239, 246, 255);
      pdf.rect(0, 0, pageWidth, headerEndY, 'F');

      // Redraw name
      y = headerStartY;
      y = addText(nameText, nameX, y, {
        fontSize: config.nameFontSize,
        fontStyle: 'bold',
        align: config.nameAlign,
        color: [0, 0, 0],
      });

      // Redraw job title
      if (personalInfo.jobTitle) {
        y = addText(personalInfo.jobTitle, nameX, y, {
          fontSize: config.bodyFontSize + 1,
          align: config.nameAlign,
          color: [80, 80, 80],
        });
      }

      // Redraw contact
      if (config.contactIcons) {
        const parts = [];
        if (personalInfo.email) parts.push('E: ' + personalInfo.email);
        if (personalInfo.phone) parts.push('P: ' + personalInfo.phone);
        if (personalInfo.location) parts.push('L: ' + personalInfo.location);
        if (personalInfo.linkedin) parts.push(personalInfo.linkedin);
        if (parts.length > 0) {
          y += 1;
          y = addText(parts.join('   |   '), margin, y, {
            fontSize: config.smallFontSize,
            color: [100, 100, 100],
          });
        }
      }
    }

    // Traditional: thick line under header
    if (config.headerLine) {
      y += 1;
      pdf.setDrawColor(30, 30, 30);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 2;
    }

    y += 2;

    // ─── Section renderers ────────────────────────────────────

    const renderSummary = () => {
      if (!personalInfo.summary) return;
      y = addSectionHeading(config.sectionNames.summary, y);
      y = addText(personalInfo.summary, margin, y, { fontSize: config.smallFontSize });
      y += 1;
    };

    const renderSkills = () => {
      if (!skills || skills.length === 0) return;
      y = addSectionHeading(config.sectionNames.skills, y);

      const getSkillText = (s) => typeof s === 'string' ? s : (s.name || s.skill || '');

      if (config.skillsLayout === 'bullets-columns') {
        const perCol = Math.ceil(skills.length / 3);
        const cols = [
          skills.slice(0, perCol),
          skills.slice(perCol, perCol * 2),
          skills.slice(perCol * 2),
        ];
        const colW = contentWidth / 3;
        const colYs = [y, y, y];

        cols.forEach((col, ci) => {
          col.forEach(skill => {
            colYs[ci] = addText(`• ${getSkillText(skill)}`, margin + (ci * colW), colYs[ci], {
              fontSize: config.bodyFontSize,
              maxWidth: colW - 5,
            });
          });
        });
        y = Math.max(...colYs);
      } else if (config.skillsLayout === 'dot-separated') {
        y = addText(skills.map(getSkillText).join('  •  '), margin, y, {
          fontSize: config.bodyFontSize,
        });
      } else {
        y = addText(skills.map(getSkillText).join(', '), margin, y, {
          fontSize: config.bodyFontSize,
        });
      }
      y += 1;
    };

    const renderExperience = () => {
      if (!workExperience || workExperience.length === 0) return;
      y = addSectionHeading(config.sectionNames.experience, y);

      workExperience.forEach(job => {
        y = checkNewPage(y);

        // Title LEFT — Date RIGHT (same line)
        const jobTitle = job.title || job.jobTitle || job.position || job.role || '';
        const startDate = job.startDate || job.start_date || job.from || '';
        const endDate = job.current || job.isCurrentRole || job.isCurrent
          ? 'Present' : (job.endDate || job.end_date || job.to || '');
        const dateStr = startDate || endDate ? `${startDate} - ${endDate}` : '';

        y = addEntryHeader(jobTitle, dateStr, y);

        // Company
        const companyText = (job.company || job.companyName || '') +
          (job.location ? `, ${job.location}` : '');
        if (companyText) {
          y = addText(companyText, margin, y, {
            fontSize: config.bodyFontSize,
            color: config.companyColor,
          });
        }

        y += 0.5;

        // Description
        const desc = job.responsibilities || job.description || job.achievements || job.duties;
        if (desc) {
          if (template === 'modern') {
            y = addFlowingText(desc, y);
          } else {
            y = addBulletPoints(desc, y);
          }
        }

        y += 2;
      });
    };

    const renderEducation = () => {
      if (!education || education.length === 0) return;
      y = addSectionHeading(config.sectionNames.education, y);

      education.forEach(edu => {
        y = checkNewPage(y);

        const degree = edu.degree || edu.degreeType || edu.degreeName || edu.degreeLevel || '';
        const field = edu.fieldOfStudy || edu.field || edu.major || '';
        const degreeInfo = field ? `${degree} in ${field}` : degree;

        const startDate = edu.startDate || edu.start_date || edu.from || edu.yearStart || '';
        const endDate = edu.current || edu.isCurrentlyEnrolled
          ? 'Present' : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || '');
        const dateStr = startDate || endDate ? `${startDate} - ${endDate}` : '';

        y = addEntryHeader(degreeInfo || 'Degree', dateStr, y);

        const institution = edu.institution || edu.school || edu.university || edu.college || '';
        if (institution) {
          y = addText(institution, margin, y, {
            fontSize: config.bodyFontSize,
            color: config.companyColor,
          });
        }

        if (edu.description) {
          y += 0.5;
          y = addText(edu.description, margin, y, { fontSize: config.smallFontSize });
        }

        y += 2;
      });
    };

    const renderCertifications = () => {
      if (!certifications || certifications.length === 0) return;
      y = addSectionHeading(config.sectionNames.certifications, y);

      certifications.forEach(cert => {
        y = checkNewPage(y);

        const certName = cert.name || cert.title || cert.certification || 'Certification';
        const certDate = cert.date || cert.issueDate || cert.year || cert.issuedDate || cert.dateIssued;
        const dateStr = certDate || 'Issue Date: Not Specified';

        y = addEntryHeader(certName, dateStr, y);

        const issuer = cert.issuer || cert.organization || cert.issuingOrganization || '';
        if (issuer) {
          y = addText(issuer, margin, y, {
            fontSize: config.bodyFontSize,
            color: config.companyColor,
          });
        }

        if (cert.description) {
          y += 0.5;
          y = addText(cert.description, margin, y, { fontSize: config.smallFontSize });
        }

        y += 2;
      });
    };

    const renderProjects = () => {
      if (!projects || projects.length === 0) return;
      y = addSectionHeading(config.sectionNames.projects, y);

      projects.forEach(project => {
        y = checkNewPage(y);

        const title = project.name || project.title || project.projectName || 'Project';

        let dateStr = '';
        if (project.date || project.duration) {
          dateStr = project.date || project.duration;
        } else {
          const s = project.startDate || project.start_date || '';
          const e = project.current || project.isCurrentProject
            ? 'Present' : (project.endDate || project.end_date || '');
          if (s || e) dateStr = s + (s && e ? ' - ' : '') + e;
        }

        y = addEntryHeader(title, dateStr, y);

        const desc = project.description || project.details || project.summary;
        if (desc) {
          y += 0.5;
          if (template === 'modern') {
            y = addFlowingText(desc, y);
          } else {
            y = addBulletPoints(desc, y);
          }
        }

        const tech = project.technologies || project.techStack || project.tools;
        if (tech) {
          y = addText(`Technologies: ${tech}`, margin, y, {
            fontSize: config.smallFontSize,
            fontStyle: 'italic',
            color: [100, 100, 100],
          });
        }

        y += 2;
      });
    };

    // ─── Render sections in template-specific order ───────────

    const sectionRenderers = {
      summary: renderSummary,
      skills: renderSkills,
      experience: renderExperience,
      education: renderEducation,
      certifications: renderCertifications,
      projects: renderProjects,
    };

    config.sectionOrder.forEach(section => {
      sectionRenderers[section]();
    });

    // ─── Save ─────────────────────────────────────────────────
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
