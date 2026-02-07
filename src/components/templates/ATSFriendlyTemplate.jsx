import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';

const ATSFriendlyTemplate = forwardRef(({ resume }, ref) => {
  const {
    personalInfo = {},
    workExperience = [],
    education = [],
    skills = [],
    certifications = [],
    projects = [],
    selectedFont = 'Arial'
  } = resume;

  // ATS-friendly fonts
  const fontFamily = selectedFont || 'Arial';

  // Ensure we're using a safe font for ATS
  const safeFonts = ['Arial', 'Calibri', 'Times New Roman', 'Helvetica', 'Garamond', 'Georgia', 'Verdana', 'Tahoma'];
  const finalFont = safeFonts.includes(fontFamily) ? fontFamily : 'Arial';

  return (
    <div
      ref={ref}
      className="w-full h-full p-6 md:p-8 overflow-auto bg-white"
      style={{
        fontFamily: finalFont,
        lineHeight: '1.5',
        color: '#333',
        maxWidth: '850px',
        margin: '0 auto'
      }}
    >
      {/* Contact Information Section - Always at the top, not in header/footer */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-center mb-2">
          {personalInfo.fullName || 'Your Name'}
        </h1>

        {/* Single line contact info with ATS-friendly separators */}
        <div className="text-center text-sm">
          {[
            personalInfo.location,
            personalInfo.phone,
            personalInfo.email,
            personalInfo.linkedin || (personalInfo.professionalLinks && personalInfo.professionalLinks.linkedin),
            personalInfo.portfolio || (personalInfo.professionalLinks && personalInfo.professionalLinks.portfolio)
          ]
            .filter(Boolean)
            .join(' | ')}
        </div>
      </div>

      {/* Professional Summary - Substantial paragraph with keywords */}
      {personalInfo.summary && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Professional Summary
          </h2>
          <p className="text-sm leading-relaxed">{personalInfo.summary}</p>
        </div>
      )}

      {/* Skills Section - Vertical bullet list format for better ATS parsing */}
      {skills.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Core Competencies
          </h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-4 mt-2 ml-5 list-disc">
            {skills.map((skill, index) => (
              <li key={index} className="text-sm">
                {typeof skill === 'string' ? skill : skill.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Professional Experience - Reverse chronological order */}
      {workExperience.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Professional Experience
          </h2>

          <div className="space-y-4">
            {workExperience.map((job, index) => (
              <div key={index} className="mb-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-base font-bold">{job.title || job.jobTitle}</h3>
                    <p className="text-sm font-medium">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatResumeDate(job.startDate)} - {job.current ? 'Present' : formatResumeDate(job.endDate)}
                  </p>
                </div>

                {/* Responsibilities as bullet points */}
                <div className="mt-2 text-sm whitespace-pre-line leading-relaxed">{job.responsibilities || job.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education Section */}
      {education.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Education
          </h2>

          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index} className="mb-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-base font-bold">{edu.degree} {edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ''}</h3>
                    <p className="text-sm font-medium">{edu.institution}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatResumeDate(edu.startDate)} - {edu.current ? 'Present' : formatResumeDate(edu.endDate)}
                  </p>
                </div>

                {edu.description && (
                  <p className="mt-1 text-sm">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications Section */}
      {certifications && certifications.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Certifications & Licenses
          </h2>

          <div className="space-y-2">
            {certifications.map((cert, index) => (
              <div key={index} className="mb-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <div>
                    <h3 className="text-base font-medium">{cert.name}</h3>
                    {cert.issuer && <p className="text-sm">{cert.issuer}</p>}
                  </div>
                  <p className="text-sm text-gray-600">
                    {cert.date ? `Issue Date: ${formatResumeDate(cert.date)}` : 'Issue Date: Not Specified'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Section */}
      {projects && projects.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2 border-b border-gray-300 pb-1">
            Additional Projects
          </h2>

          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={index} className="mb-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                  <h3 className="text-base font-bold">{project.title}</h3>
                  <p className="text-sm text-gray-600">
                    {project.startDate ? formatResumeDate(project.startDate) : ''}
                    {project.startDate && (project.endDate || project.current) ? ' - ' : ''}
                    {project.current ? 'Present' : project.endDate ? formatResumeDate(project.endDate) : project.date ? formatResumeDate(project.date) : ''}
                  </p>
                </div>
                <div className="mt-1 text-sm">
                  {/* Convert project description to bullet points if it's not already */}
                  {project.description.includes('•') ? (
                    <div className="whitespace-pre-line leading-relaxed">{project.description}</div>
                  ) : (
                    <ul className="list-disc ml-5 mt-1 leading-relaxed">
                      <li>{project.description}</li>
                    </ul>
                  )}
                </div>
                {project.technologies && (
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium">Technologies:</span> {project.technologies}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default ATSFriendlyTemplate;
