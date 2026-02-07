import React, { forwardRef } from 'react';
import { formatResumeDate } from '../../utils/dateUtils';

const ModernTemplate = forwardRef(({ resume }, ref) => {
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
      className="w-full h-full overflow-auto"
      style={{ fontFamily: selectedFont }}
    >
      {/* Header / Personal Info */}
      <div className="bg-blue-50 p-4 md:p-8 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">
          {personalInfo.fullName || 'Your Name'}
        </h1>

        {personalInfo.jobTitle && (
          <h2 className="text-base md:text-lg text-gray-700 mb-3">{personalInfo.jobTitle}</h2>
        )}

        <div className="flex flex-wrap text-sm text-gray-600 gap-x-4 gap-y-1">
          {personalInfo.email && (
            <div className="flex items-center">
              <span className="mr-1">✉</span>
              <span>{personalInfo.email}</span>
            </div>
          )}

          {personalInfo.phone && (
            <div className="flex items-center">
              <span className="mr-1">☎</span>
              <span>{personalInfo.phone}</span>
            </div>
          )}

          {personalInfo.location && (
            <div className="flex items-center">
              <span className="mr-1">📍</span>
              <span>{personalInfo.location}</span>
            </div>
          )}

          {personalInfo.linkedin && (
            <div className="flex items-center">
              <span className="mr-1">🔗</span>
              <span>{personalInfo.linkedin}</span>
            </div>
          )}

          {personalInfo.website && (
            <div className="flex items-center">
              <span className="mr-1">🌐</span>
              <span>{personalInfo.website}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8">
        {/* Summary */}
        {personalInfo.summary && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-blue-600 mb-2 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Professional Summary
            </h2>
            <p className="text-sm text-gray-700">{personalInfo.summary}</p>
          </div>
        )}

        {/* Work Experience */}
        {workExperience.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Work Experience
            </h2>

            <div className="space-y-5">
              {workExperience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-semibold">{job.jobTitle || job.title}</h3>
                      <p className="text-sm text-blue-700">{job.company}{job.location ? `, ${job.location}` : ''}</p>
                    </div>
                    <p className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
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
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Education
            </h2>

            <div className="space-y-4">
              {education.map((edu, index) => (
                <div key={index}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-semibold">{edu.degree}</h3>
                      <p className="text-sm text-blue-700">{edu.institution}{edu.location ? `, ${edu.location}` : ''}</p>
                      {edu.fieldOfStudy && (
                        <p className="text-sm text-gray-700">{edu.fieldOfStudy}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
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
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Skills
            </h2>

            <div className="flex flex-wrap gap-2">
              {skills.map((skill, index) => (
                <span key={index} className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                  {typeof skill === 'string' ? skill : skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Certifications
            </h2>

            <div className="space-y-3">
              {certifications.map((cert, index) => (
                <div key={index}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-semibold">{cert.name}</h3>
                      {cert.issuer && <p className="text-sm text-blue-700">{cert.issuer}</p>}
                    </div>
                    <p className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
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
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center">
              <span className="w-6 h-0.5 bg-blue-600 mr-2"></span>
              Projects
            </h2>

            <div className="space-y-4">
              {projects.map((project, index) => (
                <div key={index}>
                  <div className="flex justify-between items-start">
                    <h3 className="text-base font-semibold">{project.title}</h3>
                    <p className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
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
    </div>
  );
});

export default ModernTemplate;
