import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';

const TraditionalTemplate = forwardRef(({ resume }, ref) => {
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
      <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 uppercase">
          {personalInfo.fullName || 'Your Name'}
        </h1>

        {personalInfo.jobTitle && (
          <h2 className="text-lg text-gray-700 mb-2">{personalInfo.jobTitle}</h2>
        )}

        <div className="flex flex-wrap justify-center text-sm text-gray-600 gap-x-4">
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
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-2">
            Professional Summary
          </h2>
          <p className="text-sm text-gray-700">{personalInfo.summary}</p>
        </div>
      )}

      {/* Work Experience */}
      {workExperience.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-3">
            Work Experience
          </h2>

          <div className="space-y-5">
            {workExperience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold">{job.jobTitle || job.title}</h3>
                    <p className="text-sm font-semibold">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                  </div>
                  <p className="text-sm text-gray-600 font-semibold">
                    {formatResumeDate(job.startDate)}
                    {' - '}
                    {job.current ? 'Present' : formatResumeDate(job.endDate)}
                  </p>
                </div>
                <div className="mt-2 text-sm whitespace-pre-line">{job.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-3">
            Education
          </h2>

          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold">{edu.degree}</h3>
                    <p className="text-sm font-semibold">{edu.institution}{edu.location ? `, ${edu.location}` : ''}</p>
                    {edu.fieldOfStudy && (
                      <p className="text-sm text-gray-700">{edu.fieldOfStudy}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 font-semibold">
                    {formatResumeDate(edu.startDate)}
                    {edu.endDate && ' - '}
                    {formatResumeDate(edu.endDate)}
                  </p>
                </div>
                {edu.description && (
                  <div className="mt-2 text-sm whitespace-pre-line">{edu.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-3">
            Skills
          </h2>

          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <span key={index} className="text-sm">
                {typeof skill === 'string' ? skill : skill.name}{index < skills.length - 1 ? ' • ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-3">
            Certifications
          </h2>

          <div className="space-y-3">
            {certifications.map((cert, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold">{cert.name}</h3>
                    {cert.issuer && <p className="text-sm font-semibold">{cert.issuer}</p>}
                  </div>
                  {cert.date && (
                    <p className="text-sm text-gray-600 font-semibold">
                      {formatResumeDate(cert.date)}
                    </p>
                  )}
                </div>
                {cert.description && (
                  <p className="mt-1 text-sm">{cert.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 uppercase mb-3">
            Projects
          </h2>

          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-bold">{project.title}</h3>
                  <p className="text-sm text-gray-600 font-semibold">
                    {project.startDate ? formatResumeDate(project.startDate) : ''}
                    {project.startDate && (project.endDate || project.current) ? ' - ' : ''}
                    {project.current ? 'Present' : project.endDate ? formatResumeDate(project.endDate) : project.date ? formatResumeDate(project.date) : ''}
                  </p>
                </div>
                <div className="mt-2 text-sm whitespace-pre-line">{project.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default TraditionalTemplate;
