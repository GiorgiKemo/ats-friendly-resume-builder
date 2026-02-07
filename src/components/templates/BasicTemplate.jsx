import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';

const BasicTemplate = forwardRef(({ resume }, ref) => {

  const {
    personalInfo = {},
    workExperience = [],
    education = [],
    skills = [],
    certifications = [],
    projects = [],
    selectedFont = 'Arial'
  } = resume || {};

  return (
    <div
      ref={ref}
      className="w-full h-full p-4 md:p-8 overflow-auto"
      style={{ fontFamily: selectedFont }}
    >
      {/* Header / Personal Info */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
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
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Professional Summary
          </h2>
          <p className="text-sm text-gray-700">{personalInfo.summary}</p>
        </div>
      )}

      {/* Work Experience */}
      {workExperience.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Work Experience
          </h2>

          <div className="space-y-4">
            {workExperience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold">{job.jobTitle || job.title}</h3>
                    <p className="text-sm">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatResumeDate(job.startDate)}
                    {' - '}
                    {job.current ? 'Present' : formatResumeDate(job.endDate)}
                  </p>
                </div>
                <div className="mt-1 text-sm whitespace-pre-line">{job.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Education
          </h2>

          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold">{edu.degree}</h3>
                    <p className="text-sm">{edu.institution}{edu.location ? `, ${edu.location}` : ''}</p>
                    {edu.fieldOfStudy && (
                      <p className="text-sm text-gray-700">{edu.fieldOfStudy}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatResumeDate(edu.startDate)}
                    {edu.endDate && ' - '}
                    {formatResumeDate(edu.endDate)}
                  </p>
                </div>
                {edu.description && (
                  <div className="mt-1 text-sm whitespace-pre-line">{edu.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Skills
          </h2>

          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <span key={index} className="text-sm bg-gray-100 px-2 py-1 rounded">
                {typeof skill === 'string' ? skill : skill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Certifications
          </h2>

          <div className="space-y-3">
            {certifications.map((cert, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold">{cert.name}</h3>
                    {cert.issuer && <p className="text-sm">{cert.issuer}</p>}
                  </div>
                  <p className="text-sm text-gray-600">
                    {cert.date ? formatResumeDate(cert.date) : 'Issue Date: Not Specified'}
                  </p>
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
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">
            Projects
          </h2>

          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={index}>
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-semibold">{project.title}</h3>
                  <p className="text-sm text-gray-600">
                    {project.startDate ? formatResumeDate(project.startDate) : ''}
                    {project.startDate && (project.endDate || project.current) ? ' - ' : ''}
                    {project.current ? 'Present' : project.endDate ? formatResumeDate(project.endDate) : project.date ? formatResumeDate(project.date) : ''}
                  </p>
                </div>
                <div className="mt-1 text-sm whitespace-pre-line">{project.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default BasicTemplate;
