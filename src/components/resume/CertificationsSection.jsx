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

const emptyCertification = {
  name: '',
  issuer: '',
  date: '',
  description: '',
};

const getDraftScope = (editIndex) => (editIndex !== null ? `edit-${editIndex}` : 'new');

const CertificationsSection = () => {
  const { user } = useAuth();
  const { currentResume, updateCurrentResume } = useResume();
  const { certifications = [] } = currentResume;
  const ownerId = user?.id || '';

  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [certForm, setCertForm] = useState(emptyCertification);

  const pendingDraft = loadResumeSectionDraft(currentResume.id, 'certifications', 'new', ownerId);

  const openForm = (nextEditIndex, fallbackValue) => {
    const scope = getDraftScope(nextEditIndex);
    const savedDraft = loadResumeSectionDraft(currentResume.id, 'certifications', scope, ownerId);

    setIsAdding(true);
    setEditIndex(nextEditIndex);
    setCertForm(savedDraft || fallbackValue);
  };

  const handleAddNew = () => {
    openForm(null, pendingDraft || emptyCertification);
  };

  const handleEdit = (index) => {
    openForm(index, { ...certifications[index] });
  };

  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this certification?')) {
      const updatedCertifications = [...certifications];
      updatedCertifications.splice(index, 1);
      clearResumeSectionDraft(currentResume.id, 'certifications', `edit-${index}`, ownerId);
      updateCurrentResume({ certifications: updatedCertifications });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextForm = {
      ...certForm,
      [name]: value,
    };

    setCertForm(nextForm);
    saveResumeSectionDraft(currentResume.id, 'certifications', getDraftScope(editIndex), nextForm, ownerId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const updatedCertifications = [...certifications];

    if (editIndex !== null) {
      updatedCertifications[editIndex] = certForm;
    } else {
      updatedCertifications.push(certForm);
    }

    clearResumeSectionDraft(currentResume.id, 'certifications', getDraftScope(editIndex), ownerId);
    updateCurrentResume({ certifications: updatedCertifications });
    setIsAdding(false);
    setEditIndex(null);
    setCertForm(emptyCertification);
  };

  const handleCancel = () => {
    clearResumeSectionDraft(currentResume.id, 'certifications', getDraftScope(editIndex), ownerId);
    setIsAdding(false);
    setEditIndex(null);
    setCertForm(emptyCertification);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Certifications</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            {pendingDraft ? 'Continue Draft' : 'Add Certification'}
          </Button>
        )}
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-slate-900 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editIndex !== null ? 'Edit Certification' : 'Add Certification'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Certification Name"
              id="name"
              name="name"
              value={certForm.name}
              onChange={handleChange}
              required
              tooltip="Enter the full name of the certification"
              placeholder="AWS Certified Solutions Architect"
            />

            <Input
              label="Issuing Organization"
              id="issuer"
              name="issuer"
              value={certForm.issuer}
              onChange={handleChange}
              required
              tooltip="Enter the organization that issued the certification"
              placeholder="Amazon Web Services"
            />

            <Input
              label="Date Earned"
              id="date"
              name="date"
              type="month"
              value={certForm.date}
              onChange={handleChange}
              tooltip="Use MM/YYYY format for ATS compatibility"
              className="md:col-span-2"
            />

            <div className="md:col-span-2">
              <Textarea
                label="Description"
                id="description"
                name="description"
                value={certForm.description}
                onChange={handleChange}
                rows={3}
                tooltip="Optional: Include details about the certification or skills demonstrated"
                placeholder="Validated expertise in designing distributed systems on AWS. Demonstrated knowledge of AWS architectural best practices."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {editIndex !== null ? 'Update' : 'Add'} Certification
            </Button>
          </div>
        </form>
      ) : certifications.length === 0 ? (
        <div className="bg-gray-50 dark:bg-slate-900 p-8 rounded-lg text-center">
          <p className="text-gray-600 dark:text-slate-400 mb-4">You haven&apos;t added any certifications yet.</p>
          <Button onClick={handleAddNew}>{pendingDraft ? 'Continue Draft' : 'Add Certification'}</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {certifications.map((cert, index) => (
            <div key={index} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{cert.name}</h3>
                  <p className="text-gray-700 dark:text-slate-300">{cert.issuer}</p>
                  {cert.date && (
                    <p className="text-gray-500 dark:text-slate-500 text-sm">
                      Earned: {new Date(cert.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
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
              {cert.description && (
                <div className="mt-4 text-gray-700 dark:text-slate-300">
                  {cert.description}
                </div>
              )}
            </div>
          ))}

          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              {pendingDraft ? 'Continue Draft' : 'Add Another Certification'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">ATS Tips for Certifications</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-400 space-y-2">
          <li>Include the full, official name of the certification</li>
          <li>List the official issuing organization</li>
          <li>Use MM/YYYY format for dates</li>
          <li>Include certification ID or verification URL if available</li>
          <li>List certifications in reverse chronological order (most recent first)</li>
          <li>Include expiration date if the certification is not permanent</li>
        </ul>
      </div>
    </div>
  );
};

export default CertificationsSection;
