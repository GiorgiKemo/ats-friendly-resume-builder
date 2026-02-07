import { jsPDF } from 'jspdf';

/**
 * Generate a text-based PDF from a resume object
 * @param {Object} resume - The resume data
 * @param {string} filename - The filename for the downloaded PDF
 */
export const downloadResumePdf = (resume, filename = 'resume') => {
  try {
    // Use the resume data directly
    const completeResume = resume || {};

    const {
      personalInfo = {},
      workExperience = [],
      education = [],
      skills = [],
      certifications = [],
      projects = []
    } = completeResume;

    // Create a new PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Set default font
    pdf.setFont('helvetica');

    // Define margins and positions
    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - (margin * 2);

    // Current Y position for content
    let y = margin;

    // Helper function to add text with word wrapping
    const addText = (text, x, y, options = {}) => {
      const {
        fontSize = 10,
        fontStyle = 'normal',
        align = 'left',
        lineHeight = 1.2,
        maxWidth = contentWidth
      } = options;

      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', fontStyle);

      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.text(lines, x, y, { align });

      return y + (lines.length * fontSize * 0.352778 * lineHeight);
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

    // Helper function to check if we need a new page
    const checkNewPage = (yPosition, minSpace = 20) => {
      if (yPosition + minSpace > pageHeight - margin) {
        pdf.addPage();
        return margin;
      }
      return yPosition;
    };

    // Add personal information
    y = addText(personalInfo.fullName || 'Your Name', pageWidth / 2, y, {
      fontSize: 16,
      fontStyle: 'bold',
      align: 'center'
    });

    // Contact information
    const contactInfo = [];
    if (personalInfo.email) contactInfo.push(personalInfo.email);
    if (personalInfo.phone) contactInfo.push(personalInfo.phone);
    if (personalInfo.location) contactInfo.push(personalInfo.location);
    if (personalInfo.linkedin) contactInfo.push(personalInfo.linkedin);

    if (contactInfo.length > 0) {
      y += 5;
      y = addText(contactInfo.join(' | '), pageWidth / 2, y, {
        fontSize: 10,
        align: 'center'
      });
      y += 5;
    }

    // Professional Summary
    if (personalInfo.summary) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Professional Summary', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 2;
      // For longer summaries, use a smaller font size and tighter line spacing
      pdf.setFontSize(9);
      const summaryLines = pdf.splitTextToSize(personalInfo.summary, contentWidth);
      pdf.text(summaryLines, margin, y);
      y += (summaryLines.length * 9 * 0.352778 * 1.1); // Adjust line height for readability
      y += 5;
    }

    // Core Competencies Section (Skills)
    if (skills && skills.length > 0) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Core Competencies', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 5;

      // Format skills as a vertical bullet list in three columns
      const skillsPerColumn = Math.ceil(skills.length / 3);
      const firstColumnSkills = skills.slice(0, skillsPerColumn);
      const secondColumnSkills = skills.slice(skillsPerColumn, skillsPerColumn * 2);
      const thirdColumnSkills = skills.slice(skillsPerColumn * 2);

      // Calculate column widths and positions
      const columnWidth = contentWidth / 3;
      const column1X = margin;
      const column2X = margin + columnWidth;
      const column3X = margin + (columnWidth * 2);

      // First column of skills
      let column1Y = y;
      firstColumnSkills.forEach(skill => {
        const skillText = typeof skill === 'string' ? skill : (skill.name || skill.skill || '');
        column1Y = addText(`• ${skillText}`, column1X, column1Y, {
          fontSize: 10,
          maxWidth: columnWidth - 5
        });
      });

      // Second column of skills
      let column2Y = y;
      secondColumnSkills.forEach(skill => {
        const skillText = typeof skill === 'string' ? skill : (skill.name || skill.skill || '');
        column2Y = addText(`• ${skillText}`, column2X, column2Y, {
          fontSize: 10,
          maxWidth: columnWidth - 5
        });
      });

      // Third column of skills
      let column3Y = y;
      thirdColumnSkills.forEach(skill => {
        const skillText = typeof skill === 'string' ? skill : (skill.name || skill.skill || '');
        column3Y = addText(`• ${skillText}`, column3X, column3Y, {
          fontSize: 10,
          maxWidth: columnWidth - 5
        });
      });

      // Set y to the maximum height of all three columns
      y = Math.max(column1Y, column2Y, column3Y);

      y += 5;
    }

    // Professional Experience Section
    if (workExperience && workExperience.length > 0) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Professional Experience', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 5;

      workExperience.forEach(job => {
        y = checkNewPage(y);

        // Job title and company - handle different field names
        y = addText(`${job.title || job.jobTitle || job.position || job.role || ''}`, margin, y, {
          fontSize: 11,
          fontStyle: 'bold'
        });

        y = addText(`${job.company || job.companyName || job.employer || job.organization || ''}`, margin, y, {
          fontSize: 10
        });

        // Job duration - handle different field names
        const startDate = job.startDate || job.start_date || job.from || '';
        const endDate = job.current || job.isCurrentRole || job.isCurrent ? 'Present' : (job.endDate || job.end_date || job.to || '');
        const dateText = `${startDate} - ${endDate}`;

        y = addText(dateText, margin, y, {
          fontSize: 9,
          fontStyle: 'italic'
        });

        y += 2;

        // Job responsibilities - handle different field names
        if (job.responsibilities || job.description || job.achievements || job.duties) {
          // Split bullet points if they're in a string format with newlines
          const jobDescription = normalizeTextBlock(job.responsibilities || job.description || job.achievements || job.duties);
          // Handle both \n and \\n as newline characters
          const bulletPoints = jobDescription.replace(/\\n/g, '\n').split('\n');

          bulletPoints.forEach(point => {
            if (point.trim()) {
              y = checkNewPage(y);
              const bulletText = point.trim().startsWith('•') ? point.trim() : `• ${point.trim()}`;

              // Use a smaller font size for longer bullet points
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'normal');

              // Split long bullet points into multiple lines
              const bulletLines = pdf.splitTextToSize(bulletText, contentWidth - 10);
              pdf.text(bulletLines, margin + 5, y);

              // Calculate the height of the text and advance y position
              y += (bulletLines.length * 9 * 0.352778 * 1.2); // Slightly increased line spacing for readability

              // Add a small gap between bullet points
              y += 1;
            }
          });
        }

        y += 5;
      });
    }

    // Education Section
    if (education && education.length > 0) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Education', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 5;

      education.forEach(edu => {
        y = checkNewPage(y);

        // Handle different degree field names and formats
        const degree = edu.degree || edu.degreeType || edu.degreeName || edu.degreeLevel || '';
        const field = edu.fieldOfStudy || edu.field || edu.major || '';

        const degreeInfo = field
          ? `${degree} in ${field}`
          : degree;

        y = addText(degreeInfo, margin, y, {
          fontSize: 11,
          fontStyle: 'bold'
        });

        // Handle different institution field names
        const institution = edu.institution || edu.school || edu.university || edu.college || "Institution";
        y = addText(institution, margin, y, {
          fontSize: 10
        });

        // Handle different date field names
        const startDate = edu.startDate || edu.start_date || edu.from || edu.yearStart || '';
        const endDate = edu.current || edu.isCurrentlyEnrolled ? 'Present' : (edu.endDate || edu.end_date || edu.to || edu.yearEnd || '');
        const dateText = `${startDate} - ${endDate}`;

        y = addText(dateText, margin, y, {
          fontSize: 9,
          fontStyle: 'italic'
        });

        if (edu.description) {
          y += 2;
          y = addText(edu.description, margin, y);
        }

        y += 5;
      });
    }

    // Certifications & Licenses Section
    if (certifications && certifications.length > 0) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Certifications & Licenses', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 5;

      certifications.forEach(cert => {
        y = checkNewPage(y);

        // Handle different certification name field names
        const certName = cert.name || cert.title || cert.certification || cert.certificationName || "Certification";
        y = addText(certName, margin, y, {
          fontSize: 11,
          fontStyle: 'bold'
        });

        // Handle different issuer field names
        const issuer = cert.issuer || cert.organization || cert.issuingOrganization || cert.provider || cert.authority;
        if (issuer) {
          y = addText(issuer, margin, y, {
            fontSize: 10
          });
        }

        // Always show issue date, even if not specified
        // Handle different date field names
        const certDate = cert.date || cert.issueDate || cert.year || cert.issuedDate || cert.dateIssued;
        const dateText = certDate ? `Issue Date: ${certDate}` : 'Issue Date: Not Specified';
        y = addText(dateText, margin, y, {
          fontSize: 9,
          fontStyle: 'italic'
        });

        y += 5;
      });
    }

    // Additional Projects Section
    if (projects && projects.length > 0) {
      y = checkNewPage(y);
      y += 5;
      y = addText('Additional Projects', margin, y, {
        fontSize: 12,
        fontStyle: 'bold'
      });
      y += 5;

      projects.forEach(project => {
        y = checkNewPage(y);

        // Project title - handle different field names
        const projectTitle = project.name || project.title || project.projectName ||
                            // Try to extract a title from the description if no name is provided
                            (project.description && project.description.split('\n')[0]?.trim().split('.')[0]) ||
                            "Project Name";

        y = addText(projectTitle, margin, y, {
          fontSize: 11,
          fontStyle: 'bold'
        });

        // Project date - handle different field names and formats
        let projectDateValue = null;

        // Check for date ranges in the format "Oct 2023 - Mar 2024"
        if (project.date || project.duration || project.timeframe || project.period) {
          projectDateValue = project.date || project.duration || project.timeframe || project.period;
        }
        // Check for specific start and end dates
        else if (project.startDate || project.start_date || project.endDate || project.end_date) {
          const startDate = project.startDate || project.start_date || '';
          const endDate = project.current || project.isCurrentProject ? 'Present' : (project.endDate || project.end_date || '');
          if (startDate || endDate) {
            projectDateValue = startDate + (startDate && endDate ? ' - ' : '') + endDate;
          }
        }

        const projectDate = projectDateValue ? projectDateValue : 'Completion Date: Not Specified';
        y = addText(projectDate, margin, y, {
          fontSize: 9,
          fontStyle: 'italic'
        });

        // Handle different description field names
        const projectDescription = project.description || project.details || project.summary;
        if (projectDescription) {
          y += 2;

          // Check if the description already has bullet points
          if (projectDescription.includes('•')) {
            // Split bullet points if they're in a string format with newlines
            // Handle both \n and \\n as newline characters
            const bulletPoints = projectDescription.replace(/\\n/g, '\n').split('\n');

            bulletPoints.forEach(point => {
              if (point.trim()) {
                y = checkNewPage(y);
                const bulletText = point.trim().startsWith('•') ? point.trim() : `• ${point.trim()}`;

                // Use a smaller font size for longer bullet points
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');

                // Split long bullet points into multiple lines
                const bulletLines = pdf.splitTextToSize(bulletText, contentWidth - 10);
                pdf.text(bulletLines, margin + 5, y);

                // Calculate the height of the text and advance y position
                y += (bulletLines.length * 9 * 0.352778 * 1.2); // Slightly increased line spacing for readability

                // Add a small gap between bullet points
                y += 1;
              }
            });
          } else {
            // Add a bullet point if it doesn't have one
            // Use a smaller font size for longer descriptions
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');

            // Split long descriptions into multiple lines
            const bulletText = `• ${projectDescription}`;
            const bulletLines = pdf.splitTextToSize(bulletText, contentWidth - 10);
            pdf.text(bulletLines, margin + 5, y);

            // Calculate the height of the text and advance y position
            y += (bulletLines.length * 9 * 0.352778 * 1.2);
          }
        }

        // Handle different technologies field names
        const technologies = project.technologies || project.techStack || project.tools || project.tech;
        if (technologies) {
          y += 2;
          y = addText(`Technologies: ${technologies}`, margin, y, {
            fontSize: 9,
            fontStyle: 'italic'
          });
        }

        y += 5;
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
