import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const EducationSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { education = [] } = currentResume;

  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);

  const emptyEducation = {
    institution: '',
    degree: '',
    fieldOfStudy: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: ''
  };

  const [educationForm, setEducationForm] = useState(emptyEducation);

  const handleAddNew = () => {
    setIsAdding(true);
    setEditIndex(null);
    setEducationForm(emptyEducation);
  };

  const handleEdit = (index) => {
    setIsAdding(true);
    setEditIndex(index);
    setEducationForm(education[index]);
  };

  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this education entry?')) {
      const updatedEducation = [...education];
      updatedEducation.splice(index, 1);
      updateCurrentResume({ education: updatedEducation });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEducationForm({
      ...educationForm,
      [name]: type === 'checkbox' ? checked : value
    });

    // If "current" is checked, clear the end date
    if (name === 'current' && checked) {
      setEducationForm(prev => ({
        ...prev,
        endDate: ''
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!educationForm.institution.trim() || !educationForm.degree.trim()) {
      return;
    }

    const updatedEducation = [...education];

    if (editIndex !== null) {
      updatedEducation[editIndex] = educationForm;
    } else {
      updatedEducation.push(educationForm);
    }

    updateCurrentResume({ education: updatedEducation });
    setIsAdding(false);
    setEditIndex(null);
    setEducationForm(emptyEducation);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditIndex(null);
    setEducationForm(emptyEducation);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Education</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            Add Education
          </Button>
        )}
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editIndex !== null ? 'Edit Education' : 'Add Education'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Institution"
              id="institution"
              name="institution"
              value={educationForm.institution}
              onChange={handleChange}
              required
              tooltip="Enter the name of your school or university"
              placeholder="Harvard University"
            />

            <Input
              label="Degree"
              id="degree"
              name="degree"
              value={educationForm.degree}
              onChange={handleChange}
              required
              tooltip="Enter your degree type (e.g., Bachelor of Science)"
              placeholder="Bachelor of Science"
            />

            <Input
              label="Field of Study"
              id="fieldOfStudy"
              name="fieldOfStudy"
              value={educationForm.fieldOfStudy}
              onChange={handleChange}
              tooltip="Enter your major or concentration"
              placeholder="Computer Science"
            />

            <Input
              label="Location"
              id="location"
              name="location"
              value={educationForm.location}
              onChange={handleChange}
              tooltip="City, State or Country"
              placeholder="Cambridge, MA"
            />

            <div className="md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
                <Input
                  label="Start Date"
                  id="startDate"
                  name="startDate"
                  type="month"
                  value={educationForm.startDate}
                  onChange={handleChange}
                  required
                  tooltip="Use MM/YYYY format for ATS compatibility"
                />

                <Input
                  label="End Date"
                  id="endDate"
                  name="endDate"
                  type="month"
                  value={educationForm.endDate}
                  onChange={handleChange}
                  disabled={educationForm.current}
                  tooltip="Use MM/YYYY format for ATS compatibility"
                />
              </div>

              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="current"
                  name="current"
                  checked={educationForm.current}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="current" className="ml-2 block text-sm text-gray-700">
                  I am currently studying here
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Description"
                id="description"
                name="description"
                value={educationForm.description}
                onChange={handleChange}
                rows={4}
                tooltip="Include relevant coursework, achievements, or activities"
                placeholder="• Relevant coursework: Data Structures, Algorithms, Machine Learning
• GPA: 3.8/4.0
• Dean's List: 2019-2021"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {editIndex !== null ? 'Update' : 'Add'} Education
            </Button>
          </div>
        </form>
      ) : education.length === 0 ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <p className="text-gray-600 mb-4">You haven't added any education yet.</p>
          <Button onClick={handleAddNew}>Add Education</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {education.map((edu, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{edu.degree}</h3>
                  <p className="text-gray-700">{edu.institution}</p>
                  {edu.fieldOfStudy && (
                    <p className="text-gray-600">{edu.fieldOfStudy}</p>
                  )}
                  <p className="text-gray-500 text-sm">
                    {edu.location && `${edu.location} • `}
                    {edu.startDate && new Date(edu.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    {' - '}
                    {edu.current ? 'Present' : edu.endDate ? new Date(edu.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : ''}
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
              {edu.description && (
                <div className="mt-4 whitespace-pre-line text-gray-700">
                  {edu.description}
                </div>
              )}
            </div>
          ))}

          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              Add Another Education
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tips for Education</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>List your highest degree first (reverse chronological order)</li>
          <li>Include the full name of your degree (e.g., "Bachelor of Science" instead of "BS")</li>
          <li>Use MM/YYYY format for dates to ensure ATS compatibility</li>
          <li>Include relevant coursework that matches job requirements</li>
          <li>If you have a high GPA (3.5+), include it</li>
        </ul>
      </div>
    </div>
  );
};

export default EducationSection;
