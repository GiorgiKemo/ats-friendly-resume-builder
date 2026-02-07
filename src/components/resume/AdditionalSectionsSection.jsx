import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const AdditionalSectionsSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { additionalSections = [] } = currentResume;
  
  const [isAdding, setIsAdding] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  
  const emptySection = {
    title: '',
    content: ''
  };
  
  const [sectionForm, setSectionForm] = useState(emptySection);
  
  const handleAddNew = () => {
    setIsAdding(true);
    setEditIndex(null);
    setSectionForm(emptySection);
  };
  
  const handleEdit = (index) => {
    setIsAdding(true);
    setEditIndex(index);
    setSectionForm(additionalSections[index]);
  };
  
  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this section?')) {
      const updatedSections = [...additionalSections];
      updatedSections.splice(index, 1);
      updateCurrentResume({ additionalSections: updatedSections });
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSectionForm({
      ...sectionForm,
      [name]: value
    });
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const updatedSections = [...additionalSections];
    
    if (editIndex !== null) {
      updatedSections[editIndex] = sectionForm;
    } else {
      updatedSections.push(sectionForm);
    }
    
    updateCurrentResume({ additionalSections: updatedSections });
    setIsAdding(false);
    setEditIndex(null);
    setSectionForm(emptySection);
  };
  
  const handleCancel = () => {
    setIsAdding(false);
    setEditIndex(null);
    setSectionForm(emptySection);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Additional Sections</h2>
        {!isAdding && (
          <Button onClick={handleAddNew}>
            Add Section
          </Button>
        )}
      </div>
      
      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editIndex !== null ? 'Edit Section' : 'Add Section'}
          </h3>
          
          <div className="space-y-4">
            <Input
              label="Section Title"
              id="title"
              name="title"
              value={sectionForm.title}
              onChange={handleChange}
              required
              tooltip="Use a clear, descriptive title (e.g., 'Volunteer Experience', 'Publications')"
              placeholder="Volunteer Experience"
            />
            
            <Textarea
              label="Section Content"
              id="content"
              name="content"
              value={sectionForm.content}
              onChange={handleChange}
              required
              rows={6}
              tooltip="Format with bullet points for better readability"
              placeholder="• Volunteer at Local Food Bank (2020-Present)
• Organized community fundraising events, raising over $5,000
• Led a team of 10 volunteers for weekly distribution"
            />
          </div>
          
          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {editIndex !== null ? 'Update' : 'Add'} Section
            </Button>
          </div>
        </form>
      ) : additionalSections.length === 0 ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <p className="text-gray-600 mb-4">You haven't added any additional sections yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Additional sections can include volunteer experience, publications, languages, interests, or any other relevant information.
          </p>
          <Button onClick={handleAddNew}>Add Section</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {additionalSections.map((section, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold">{section.title}</h3>
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
                {section.content}
              </div>
            </div>
          ))}
          
          <div className="text-center mt-6">
            <Button onClick={handleAddNew}>
              Add Another Section
            </Button>
          </div>
        </div>
      )}
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tips for Additional Sections</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>Use clear, standard section headings that ATS systems can recognize</li>
          <li>Only include sections that are relevant to the job you're applying for</li>
          <li>Format content with bullet points for better readability</li>
          <li>Include keywords from the job description where appropriate</li>
          <li>Keep formatting consistent with the rest of your resume</li>
        </ul>
      </div>
      
      <div className="mt-6 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-medium text-yellow-800 mb-2">Common Additional Sections</h3>
        <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
          <li><strong>Volunteer Experience:</strong> Shows community involvement and transferable skills</li>
          <li><strong>Publications:</strong> Relevant for academic and research positions</li>
          <li><strong>Languages:</strong> Include proficiency level (e.g., "Spanish - Fluent")</li>
          <li><strong>Professional Affiliations:</strong> Industry organizations or memberships</li>
          <li><strong>Honors & Awards:</strong> Recognition for outstanding achievements</li>
          <li><strong>Relevant Coursework:</strong> Useful for recent graduates</li>
        </ul>
      </div>
    </div>
  );
};

export default AdditionalSectionsSection;
