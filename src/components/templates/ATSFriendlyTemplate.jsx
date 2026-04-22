import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';
import { getResumeProfessionalLinks } from '../../utils/resumePresentation.js';

const ATSFriendlyTemplate = forwardRef(({ resume }, ref) => {
  const {
    personalInfo = {},
    workExperience = [],
    education = [],
    skills = [],
    certifications = [],
    projects = [],
    additionalSections = [],
    selectedFont = 'Arial'
  } = resume;

  // ATS-friendly fonts
  const fontFamily = selectedFont || 'Arial';
  const professionalLinks = getResumeProfessionalLinks(personalInfo);
  const bulletPrefixPattern = /^(?:â€¢|•|-)\s*/;
  const getContentLines = (value) => value
    ?.toString()
    .split('\n')
    .map(line => line.trim())
    .map(line => line
      .replace(/^\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2\s*/, '- ')
      .replace(/^\u00e2\u20ac\u00a2\s*/, '- ')
      .replace(/^\u2022\s*/, '- '))
    .filter(Boolean) || [];
  const hasBulletLines = (lines) => lines.some(line => /^(?:â€¢|•|-)\s+/.test(line));
  const stripBulletPrefix = (line) => line.replace(bulletPrefixPattern, '').trim();
  const renderTextBlock = (value) => {
    const lines = getContentLines(value);

    if (!lines.length) {
      return null;
    }

    if (hasBulletLines(lines)) {
      return (
        <ul className="list-disc ml-5 mt-0.5">
          {lines.map((line, index) => (
            <li key={index}>{stripBulletPrefix(line)}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-1">
        {lines.map((line, index) => (
          <p key={index} className="text-sm leading-snug">
            {line}
          </p>
        ))}
      </div>
    );
  };

  // Ensure we're using a safe font for ATS
  const safeFonts = ['Arial', 'Calibri', 'Times New Roman', 'Helvetica', 'Garamond', 'Georgia', 'Verdana', 'Tahoma'];
  const finalFont = safeFonts.includes(fontFamily) ? fontFamily : 'Arial';

  return (
    <div
      ref={ref}
      className="w-full h-full overflow-auto bg-white p-6 text-gray-900 md:p-8"
      style={{
        fontFamily: finalFont,
        lineHeight: '1.4',
        color: '#333',
        backgroundColor: '#ffffff',
        maxWidth: '850px',
        margin: '0 auto'
      }}
    >
      {/* Contact Information Section - Always at the top, not in header/footer */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-center mb-1">
          {personalInfo.fullName || 'Your Name'}
        </h1>

        {/* Single line contact info with ATS-friendly separators */}
        <div className="text-center text-xs">
          {[
            personalInfo.location,
            personalInfo.phone,
            personalInfo.email,
            ...professionalLinks.all,
          ]
            .filter(Boolean)
            .join(' | ')}
        </div>
      </div>

      {/* Professional Summary */}
      {personalInfo.summary && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Professional Summary
          </h2>
          <p className="text-sm leading-snug">{personalInfo.summary}</p>
        </div>
      )}

      {/* Skills Section */}
      {skills.length > 0 && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Core Competencies
          </h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0 mt-1 ml-5 list-disc">
            {skills.map((skill, index) => (
              <li key={index} className="text-sm leading-snug">
                {typeof skill === 'string' ? skill : skill.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Professional Experience */}
      {workExperience.length > 0 && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Professional Experience
          </h2>

          <div className="space-y-2">
            {workExperience.map((job, index) => (
              <div key={index}>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-sm font-bold">{job.jobTitle || job.title}</h3>
                    <p className="text-sm">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-nowrap">
                    {formatResumeDate(job.startDate)} - {job.current ? 'Present' : formatResumeDate(job.endDate)}
                  </p>
                </div>
                <div className="mt-0.5 text-sm whitespace-pre-line leading-snug">{job.responsibilities || job.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education Section */}
      {education.length > 0 && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Education
          </h2>

          <div className="space-y-1.5">
            {education.map((edu, index) => (
              <div key={index}>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-sm font-bold">{edu.degree} {edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ''}</h3>
                    <p className="text-sm">{edu.institution}</p>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-nowrap">
                    {formatResumeDate(edu.startDate)} - {edu.current ? 'Present' : formatResumeDate(edu.endDate)}
                  </p>
                </div>
                {edu.description && (
                  <p className="mt-0.5 text-sm leading-snug">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications Section */}
      {certifications && certifications.length > 0 && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Certifications & Licenses
          </h2>

          <div className="space-y-1">
            {certifications.map((cert, index) => (
              <div key={index}>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-sm font-medium">{cert.name}</h3>
                    {cert.issuer && <p className="text-xs text-gray-600">{cert.issuer}</p>}
                  </div>
                  <p className="text-xs text-gray-600 whitespace-nowrap">
                    {cert.date ? formatResumeDate(cert.date) : ''}
                  </p>
                </div>
                {renderTextBlock(cert.description || cert.details || cert.summary)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Section */}
      {projects && projects.length > 0 && (
        <div className="mb-3">
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            Additional Projects
          </h2>

          <div className="space-y-2">
            {projects.map((project, index) => (
              <div key={index}>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <h3 className="text-sm font-bold">{project.title}</h3>
                  <p className="text-xs text-gray-600 whitespace-nowrap">
                    {project.startDate ? formatResumeDate(project.startDate) : ''}
                    {project.startDate && (project.endDate || project.current) ? ' - ' : ''}
                    {project.current ? 'Present' : project.endDate ? formatResumeDate(project.endDate) : project.date ? formatResumeDate(project.date) : ''}
                  </p>
                </div>
                {project.description && renderTextBlock(project.description)}
                {project.__useLegacyDescriptionRenderer && project.description && (
                  <div className="mt-0.5 text-sm leading-snug">
                    {project.description.includes('•') ? (
                      <div className="whitespace-pre-line">{project.description}</div>
                    ) : (
                      <ul className="list-disc ml-5 mt-0.5">
                        <li>{project.description}</li>
                      </ul>
                    )}
                  </div>
                )}
                {project.technologies && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Technologies:</span> {project.technologies}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {additionalSections && additionalSections.length > 0 && additionalSections.map((section, index) => (
        <div className="mb-3" key={`${section.title || 'additional'}-${index}`}>
          <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5">
            {section.title || 'Additional Information'}
          </h2>
          <div className="mt-0.5 text-sm leading-snug">
            {renderTextBlock(section.content || section.description)}
          </div>
        </div>
      ))}
    </div>
  );
});

export default ATSFriendlyTemplate;
