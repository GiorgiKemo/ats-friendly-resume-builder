import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const WorkExperienceSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { workExperience = [] } = currentResume;

  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);

  const emptyJob = {
    jobTitle: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: ''
  };

  const [jobForm, setJobForm] = useState(emptyJob);

  const handleAddNew = () => {
    setIsAdding(true);
    setEditIndex(null);
    setJobForm(emptyJob);
  };

  const handleEdit = (index) => {
    setIsAdding(true);
    setEditIndex(index);
    setJobForm(workExperience[index]);
  };

  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this work experience?')) {
      const updatedExperience = [...workExperience];
      updatedExperience.splice(index, 1);
      updateCurrentResume({ workExperience: updatedExperience });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setJobForm({
      ...jobForm,
      [name]: type === 'checkbox' ? checked : value
    });

    // If "current" is checked, clear the end date
    if (name === 'current' && checked) {
      setJobForm(prev => ({
        ...prev,
        endDate: ''
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const updatedExperience = [...workExperience];

    if (editIndex !== null) {
      updatedExperience[editIndex] = jobForm;
    } else {
      updatedExperience.push(jobForm);
    }

    updateCurrentResume({ workExperience: updatedExperience });
    setIsAdding(false);
    setEditIndex(null);
    setJobForm(emptyJob);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditIndex(null);
    setJobForm(emptyJob);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Work Experience</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            Add Work Experience
          </Button>
        )}
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editIndex !== null ? 'Edit Work Experience' : 'Add Work Experience'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Job Title"
              id="jobTitle"
              name="jobTitle"
              value={jobForm.jobTitle}
              onChange={handleChange}
              required
              tooltip="Use the exact job title from your position"
              placeholder="Senior Software Engineer"
            />

            <Input
              label="Company"
              id="company"
              name="company"
              value={jobForm.company}
              onChange={handleChange}
              required
              tooltip="Use the full company name"
              placeholder="Acme Corporation"
            />

            <Input
              label="Location"
              id="location"
              name="location"
              value={jobForm.location}
              onChange={handleChange}
              tooltip="City, State or Remote"
              placeholder="San Francisco, CA"
            />

            <div className="md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
                <Input
                  label="Start Date"
                  id="startDate"
                  name="startDate"
                  type="month"
                  value={jobForm.startDate}
                  onChange={handleChange}
                  required
                  tooltip="Use MM/YYYY format for ATS compatibility"
                />

                <Input
                  label="End Date"
                  id="endDate"
                  name="endDate"
                  type="month"
                  value={jobForm.endDate}
                  onChange={handleChange}
                  disabled={jobForm.current}
                  tooltip="Use MM/YYYY format for ATS compatibility"
                />
              </div>

              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="current"
                  name="current"
                  checked={jobForm.current}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="current" className="ml-2 block text-sm text-gray-700">
                  I currently work here
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Job Description"
                id="description"
                name="description"
                value={jobForm.description}
                onChange={handleChange}
                required
                rows={6}
                tooltip="Use bullet points starting with action verbs and include metrics when possible"
                placeholder="• Developed and maintained a React-based web application that increased user engagement by 35%
• Led a team of 5 developers to implement new features and improve code quality
• Reduced application load time by 40% through performance optimizations"
              />
              <p className="mt-2 text-sm text-gray-500">
                Use bullet points starting with action verbs (e.g., "Developed," "Managed," "Increased").
                Quantify achievements with numbers when possible.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {editIndex !== null ? 'Update' : 'Add'} Experience
            </Button>
          </div>
        </form>
      ) : workExperience.length === 0 ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <p className="text-gray-600 mb-4">You haven't added any work experience yet.</p>
          <Button onClick={handleAddNew}>Add Work Experience</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {workExperience.map((job, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{job.jobTitle}</h3>
                  <p className="text-gray-700">{job.company}</p>
                  <p className="text-gray-500 text-sm">
                    {job.location && `${job.location} • `}
                    {job.startDate && new Date(job.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    {' - '}
                    {job.current ? 'Present' : job.endDate ? new Date(job.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : ''}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(index)}
                    className="text-blue-600 hover:text-blue-800"
                    aria-label="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="text-red-600 hover:text-red-800"
                    aria-label="Delete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-4 whitespace-pre-line text-gray-700">
                {job.description}
              </div>
            </div>
          ))}

          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              Add Another Experience
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tips for Work Experience</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>Use the MM/YYYY format for dates to ensure ATS compatibility</li>
          <li>Include keywords from the job description in your work experience</li>
          <li>Start bullet points with action verbs (e.g., "Developed," "Managed," "Increased")</li>
          <li>Quantify achievements with numbers when possible (e.g., "Increased sales by 20%")</li>
          <li>List your most recent experience first (reverse chronological order)</li>
        </ul>
      </div>
    </div>
  );
};

export default WorkExperienceSection;
