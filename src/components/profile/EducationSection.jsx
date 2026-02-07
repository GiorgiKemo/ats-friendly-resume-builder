import React, { useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const EducationSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    institution: '',
    degree: '',
    fieldOfStudy: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: ''
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentItem(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddOrUpdate = () => {
    const newData = [...data];

    if (editIndex !== null) {
      // Update existing item
      newData[editIndex] = currentItem;
    } else {
      // Add new item
      newData.push(currentItem);
    }

    onChange(newData);
    resetForm();
  };

  const handleEdit = (index) => {
    setEditIndex(index);
    setCurrentItem(data[index]);
  };

  const handleDelete = (index) => {
    if (window.confirm('Are you sure you want to delete this education entry?')) {
      const newData = [...data];
      newData.splice(index, 1);
      onChange(newData);
    }
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      institution: '',
      degree: '',
      fieldOfStudy: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      description: ''
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Your Educational Background</h2>

      {/* List existing education entries */}
      {data.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Your Saved Educational Qualifications</h3>
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{item.degree} in {item.fieldOfStudy}</h4>
                    <p className="text-gray-600">{item.institution}, {item.location}</p>
                    <p className="text-sm text-gray-500">
                      {item.startDate} - {item.current ? 'Present' : item.endDate}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(index)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {item.description && (
                  <div className="mt-2">
                    <p className="text-sm whitespace-pre-line">{item.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form to add/edit education */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Qualification Details' : 'Add New Qualification'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Institution"
            id="institution"
            name="institution"
            value={currentItem.institution}
            onChange={handleInputChange}
            required
            tooltip="Full name of the educational institution (e.g., University of California, Berkeley)."
            placeholder="University of California, Berkeley"
          />

          <Input
            label="Degree"
            id="degree"
            name="degree"
            value={currentItem.degree}
            onChange={handleInputChange}
            required
            tooltip="The degree you obtained (e.g., Bachelor of Science, Master of Arts)."
            placeholder="Bachelor of Science"
          />

          <Input
            label="Field of Study"
            id="fieldOfStudy"
            name="fieldOfStudy"
            value={currentItem.fieldOfStudy}
            onChange={handleInputChange}
            required
            tooltip="Your primary area of study or major (e.g., Computer Science, Marketing)."
            placeholder="Computer Science"
          />

          <Input
            label="Location"
            id="location"
            name="location"
            value={currentItem.location}
            onChange={handleInputChange}
            tooltip="Location of the institution (e.g., Berkeley, CA, USA)."
            placeholder="Berkeley, CA, USA"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Start Date"
              id="startDate"
              name="startDate"
              type="month"
              value={currentItem.startDate}
              onChange={handleInputChange}
              required
              tooltip="Month and year you began this course of study."
            />

            <div className="flex flex-col">
              <Input
                label="End Date"
                id="endDate"
                name="endDate"
                type="month"
                value={currentItem.endDate}
                onChange={handleInputChange}
                disabled={currentItem.current}
                tooltip="Month and year you completed or expect to complete your studies. Leave blank if current."
              />
              <div className="mt-1 flex items-center">
                <input
                  type="checkbox"
                  id="current"
                  name="current"
                  checked={currentItem.current}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <label htmlFor="current" className="text-sm text-gray-700">
                  Currently enrolled here
                </label>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <Textarea
              label="Additional Information"
              id="description"
              name="description"
              value={currentItem.description}
              onChange={handleInputChange}
              rows={4}
              tooltip="Optional: Add details like GPA (if strong), honors, relevant coursework, thesis, or extracurriculars."
              placeholder="e.g.,
• Dean's List (2020-2022), GPA: 3.9/4.0
• Key Coursework: Advanced Algorithms, Database Management
• Thesis: Impact of AI on Modern Marketing Strategies"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end space-x-2">
          {editIndex !== null && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
          <Button onClick={handleAddOrUpdate}>
            {editIndex !== null ? 'Update This Qualification' : 'Add This Qualification'}
          </Button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">Pro Tip for Your Resume</h3>
        <p className="text-sm text-blue-700">
          On your resume, typically list your highest degree first. If your GPA is strong (e.g., 3.5+ or equivalent), consider including it. Highlighting relevant coursework can also be beneficial, especially if it aligns with your target job.
        </p>
      </div>
    </div>
  );
};

export default EducationSection;
