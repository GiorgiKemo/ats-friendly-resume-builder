import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';

const MinimalistTemplate = forwardRef(({ resume }, ref) => {
  const {
    personalInfo = {},
    workExperience = [],
    education = [],
    skills = [],
    certifications = [],
    projects = [],
    selectedFont = 'Arial'
  } = resume;

  return (
    <div
      ref={ref}
      className="w-full h-full p-4 md:p-8 overflow-auto"
      style={{ fontFamily: selectedFont }}
    >
      {/* Header / Personal Info */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {personalInfo.fullName || 'Your Name'}
        </h1>

        {personalInfo.jobTitle && (
          <h2 className="text-base text-gray-600 mb-3">{personalInfo.jobTitle}</h2>
        )}

        <div className="flex flex-wrap text-sm text-gray-600 gap-x-4 gap-y-1">
          {personalInfo.email && (
            <span>{personalInfo.email}</span>
          )}

          {personalInfo.phone && (
            <span>{personalInfo.phone}</span>
          )}

          {personalInfo.location && (
            <span>{personalInfo.location}</span>
          )}

          {personalInfo.linkedin && (
            <span>{personalInfo.linkedin}</span>
          )}

          {personalInfo.website && (
            <span>{personalInfo.website}</span>
          )}
        </div>
      </div>

      {/* Summary */}
      {personalInfo.summary && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2">
            SUMMARY
          </h2>
          <p className="text-sm text-gray-700">{personalInfo.summary}</p>
        </div>
      )}

      {/* Work Experience */}
      {workExperience.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            EXPERIENCE
          </h2>

          <div className="space-y-5">
            {workExperience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold">{job.jobTitle || job.title}</h3>
                  <p className="text-xs text-gray-600">
                    {formatResumeDate(job.startDate)}
                    {' - '}
                    {job.current ? 'Present' : formatResumeDate(job.endDate)}
                  </p>
                </div>
                <p className="text-xs text-gray-700 mb-1">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                <div className="text-xs whitespace-pre-line">{job.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            EDUCATION
          </h2>

          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold">{edu.degree}</h3>
                  <p className="text-xs text-gray-600">
                    {formatResumeDate(edu.startDate)}
                    {edu.endDate && ' - '}
                    {formatResumeDate(edu.endDate)}
                  </p>
                </div>
                <p className="text-xs text-gray-700 mb-1">{edu.institution}{edu.location ? `, ${edu.location}` : ''}</p>
                {edu.fieldOfStudy && (
                  <p className="text-xs text-gray-700 mb-1">{edu.fieldOfStudy}</p>
                )}
                {edu.description && (
                  <div className="text-xs whitespace-pre-line">{edu.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            SKILLS
          </h2>

          <div className="flex flex-wrap gap-1">
            {skills.map((skill, index) => (
              <span key={index} className="text-xs px-2 py-1">
                {typeof skill === 'string' ? skill : skill.name}{index < skills.length - 1 ? ' •' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            CERTIFICATIONS
          </h2>

          <div className="space-y-3">
            {certifications.map((cert, index) => (
              <div key={index}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold">{cert.name}</h3>
                  {cert.date && (
                    <p className="text-xs text-gray-600">
                      {formatResumeDate(cert.date)}
                    </p>
                  )}
                </div>
                {cert.issuer && <p className="text-xs text-gray-700 mb-1">{cert.issuer}</p>}
                {cert.description && (
                  <p className="text-xs">{cert.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            PROJECTS
          </h2>

          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={index}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-semibold">{project.title}</h3>
                  <p className="text-xs text-gray-600">
                    {project.startDate ? formatResumeDate(project.startDate) : ''}
                    {project.startDate && (project.endDate || project.current) ? ' - ' : ''}
                    {project.current ? 'Present' : project.endDate ? formatResumeDate(project.endDate) : project.date ? formatResumeDate(project.date) : ''}
                  </p>
                </div>
                <div className="text-xs whitespace-pre-line">{project.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default MinimalistTemplate;
