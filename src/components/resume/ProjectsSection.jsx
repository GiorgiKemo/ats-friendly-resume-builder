import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import {
  clearResumeSectionDraft,
  loadResumeSectionDraft,
  saveResumeSectionDraft,
} from '../../utils/resumeDraftStorage';

const emptyProject = {
  title: '',
  date: '',
  description: '',
};

const getDraftScope = (editIndex) => (editIndex !== null ? `edit-${editIndex}` : 'new');

const ProjectsSection = () => {
  const { user } = useAuth();
  const { currentResume, updateCurrentResume } = useResume();
  const { projects = [] } = currentResume;
  const ownerId = user?.id || '';

  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [projectForm, setProjectForm] = useState(emptyProject);

  const pendingDraft = loadResumeSectionDraft(currentResume.id, 'projects', 'new', ownerId);

  const openForm = (nextEditIndex, fallbackValue) => {
    const scope = getDraftScope(nextEditIndex);
    const savedDraft = loadResumeSectionDraft(currentResume.id, 'projects', scope, ownerId);

    setIsAdding(true);
    setEditIndex(nextEditIndex);
    setProjectForm(savedDraft || fallbackValue);
  };

  const handleAddNew = () => {
    openForm(null, pendingDraft || emptyProject);
  };

  const handleEdit = (index) => {
    openForm(index, { ...projects[index] });
  };

  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      const updatedProjects = [...projects];
      updatedProjects.splice(index, 1);
      clearResumeSectionDraft(currentResume.id, 'projects', `edit-${index}`, ownerId);
      updateCurrentResume({ projects: updatedProjects });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextForm = {
      ...projectForm,
      [name]: value,
    };

    setProjectForm(nextForm);
    saveResumeSectionDraft(currentResume.id, 'projects', getDraftScope(editIndex), nextForm, ownerId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const updatedProjects = [...projects];

    if (editIndex !== null) {
      updatedProjects[editIndex] = projectForm;
    } else {
      updatedProjects.push(projectForm);
    }

    clearResumeSectionDraft(currentResume.id, 'projects', getDraftScope(editIndex), ownerId);
    updateCurrentResume({ projects: updatedProjects });
    setIsAdding(false);
    setEditIndex(null);
    setProjectForm(emptyProject);
  };

  const handleCancel = () => {
    clearResumeSectionDraft(currentResume.id, 'projects', getDraftScope(editIndex), ownerId);
    setIsAdding(false);
    setEditIndex(null);
    setProjectForm(emptyProject);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Projects</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            {pendingDraft ? 'Continue Draft' : 'Add Project'}
          </Button>
        )}
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-slate-900 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editIndex !== null ? 'Edit Project' : 'Add Project'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Project Title"
              id="title"
              name="title"
              value={projectForm.title}
              onChange={handleChange}
              required
              tooltip="Enter a descriptive title for your project"
              placeholder="E-commerce Website Redesign"
              className="md:col-span-2"
            />

            <Input
              label="Date"
              id="date"
              name="date"
              type="month"
              value={projectForm.date}
              onChange={handleChange}
              tooltip="Use MM/YYYY format for ATS compatibility"
              className="md:col-span-2"
            />

            <div className="md:col-span-2">
              <Textarea
                label="Description"
                id="description"
                name="description"
                value={projectForm.description}
                onChange={handleChange}
                required
                rows={5}
                tooltip="Describe the project, your role, technologies used, and outcomes"
                placeholder="- Redesigned the company's e-commerce platform using React and Node.js
- Implemented responsive design principles, improving mobile conversion rates by 35%
- Integrated payment gateway APIs and optimized checkout flow
- Collaborated with a team of 4 developers using Agile methodology"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {editIndex !== null ? 'Update' : 'Add'} Project
            </Button>
          </div>
        </form>
      ) : projects.length === 0 ? (
        <div className="bg-gray-50 dark:bg-slate-900 p-8 rounded-lg text-center">
          <p className="text-gray-600 dark:text-slate-400 mb-4">You haven&apos;t added any projects yet.</p>
          <Button onClick={handleAddNew}>{pendingDraft ? 'Continue Draft' : 'Add Project'}</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project, index) => (
            <div key={`${project.title}-${index}`} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{project.title}</h3>
                  {project.date && (
                    <p className="text-gray-500 dark:text-slate-500 text-sm">
                      {new Date(project.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                    </p>
                  )}
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
              <div className="mt-4 whitespace-pre-line text-gray-700 dark:text-slate-300">
                {project.description}
              </div>
            </div>
          ))}

          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              {pendingDraft ? 'Continue Draft' : 'Add Another Project'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">ATS Tips for Projects</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-400 space-y-2">
          <li>Include projects that demonstrate skills relevant to the job you&apos;re applying for</li>
          <li>Use action verbs to describe your contributions (for example, "Developed," "Implemented," "Led")</li>
          <li>Mention specific technologies, tools, and methodologies used</li>
          <li>Quantify results when possible (for example, "Increased efficiency by 25%")</li>
          <li>For team projects, clearly indicate your specific role and contributions</li>
          <li>Include links to live projects or GitHub repositories if appropriate (and if the ATS allows URLs)</li>
        </ul>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
        <h3 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">When to Include Projects</h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
          Projects are particularly valuable to include on your resume when:
        </p>
        <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-400 space-y-1">
          <li>You&apos;re a recent graduate or have limited work experience</li>
          <li>You&apos;re changing careers and need to demonstrate transferable skills</li>
          <li>You have gaps in your employment history</li>
          <li>You&apos;ve developed skills outside of your formal work experience</li>
          <li>The job description specifically mentions project management or similar skills</li>
        </ul>
      </div>
    </div>
  );
};

export default ProjectsSection;
