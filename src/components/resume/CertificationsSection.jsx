import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const CertificationsSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { certifications = [] } = currentResume;
  
  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  
  const emptyCertification = {
    name: '',
    issuer: '',
    date: '',
    description: ''
  };
  
  const [certForm, setcertForm] = useState(emptyCertification);
  
  const handleAddNew = () => {
    setIsAdding(true);
    setEditIndex(null);
    setcertForm(emptyCertification);
  };
  
  const handleEdit = (index) => {
    setIsAdding(true);
    setEditIndex(index);
    setcertForm(certifications[index]);
  };
  
  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this certification?')) {
      const updatedCertifications = [...certifications];
      updatedCertifications.splice(index, 1);
      updateCurrentResume({ certifications: updatedCertifications });
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setcertForm({
      ...certForm,
      [name]: value
    });
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const updatedCertifications = [...certifications];
    
    if (editIndex !== null) {
      updatedCertifications[editIndex] = certForm;
    } else {
      updatedCertifications.push(certForm);
    }
    
    updateCurrentResume({ certifications: updatedCertifications });
    setIsAdding(false);
    setEditIndex(null);
    setcertForm(emptyCertification);
  };
  
  const handleCancel = () => {
    setIsAdding(false);
    setEditIndex(null);
    setcertForm(emptyCertification);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Certifications</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            Add Certification
          </Button>
        )}
      </div>
      
      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-6 rounded-lg mb-6">
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
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <p className="text-gray-600 mb-4">You haven't added any certifications yet.</p>
          <Button onClick={handleAddNew}>Add Certification</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {certifications.map((cert, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{cert.name}</h3>
                  <p className="text-gray-700">{cert.issuer}</p>
                  {cert.date && (
                    <p className="text-gray-500 text-sm">
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
                <div className="mt-4 text-gray-700">
                  {cert.description}
                </div>
              )}
            </div>
          ))}
          
          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              Add Another Certification
            </Button>
          </div>
        </div>
      )}
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tips for Certifications</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>Include the full, official name of the certification (e.g., "Microsoft Certified: Azure Administrator Associate" rather than "Azure Admin")</li>
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
