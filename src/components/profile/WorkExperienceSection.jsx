import React, { useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const WorkExperienceSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    title: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    responsibilities: ''
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
    if (window.confirm('Are you sure you want to delete this work experience?')) {
      const newData = [...data];
      newData.splice(index, 1);
      onChange(newData);
    }
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      title: '',
      company: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      responsibilities: ''
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Work Experience</h2>

      {/* List existing work experiences */}
      {data.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Your Work History</h3>
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-gray-600">{item.company}, {item.location}</p>
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
                <div className="mt-2">
                  <p className="text-sm whitespace-pre-line">{item.responsibilities}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form to add/edit work experience */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Work Experience' : 'Add Work Experience'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Job Title"
            id="title"
            name="title"
            value={currentItem.title}
            onChange={handleInputChange}
            required
            tooltip="Your official job title"
            placeholder="Software Engineer"
          />

          <Input
            label="Company"
            id="company"
            name="company"
            value={currentItem.company}
            onChange={handleInputChange}
            required
            tooltip="Name of the company or organization"
            placeholder="Acme Inc."
          />

          <Input
            label="Location"
            id="location"
            name="location"
            value={currentItem.location}
            onChange={handleInputChange}
            tooltip="City, State, Country or Remote"
            placeholder="San Francisco, CA, USA"
          />

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
              <Input
                label="Start Date"
                id="startDate"
                name="startDate"
                type="month"
                value={currentItem.startDate}
                onChange={handleInputChange}
                required
                tooltip="When you started this position"
              />

              <Input
                label="End Date"
                id="endDate"
                name="endDate"
                type="month"
                value={currentItem.endDate}
                onChange={handleInputChange}
                disabled={currentItem.current}
                tooltip="When you left this position"
              />
            </div>

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="current"
                name="current"
                checked={currentItem.current}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
              />
              <label htmlFor="current" className="text-sm text-gray-700">
                I currently work here
              </label>
            </div>
          </div>

          <div className="md:col-span-2">
            <Textarea
              label="Responsibilities & Achievements"
              id="responsibilities"
              name="responsibilities"
              value={currentItem.responsibilities}
              onChange={handleInputChange}
              rows={5}
              tooltip="Describe your key responsibilities and achievements. Use bullet points starting with action verbs."
              placeholder="• Developed and maintained web applications using React and Node.js
• Led a team of 5 developers to deliver projects on time and within budget
• Improved application performance by 40% through code optimization"
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
            {editIndex !== null ? 'Update' : 'Add'} Experience
          </Button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tip</h3>
        <p className="text-sm text-blue-700">
          Use action verbs and quantify your achievements with specific metrics. For example, "Increased sales by 20%"
          is more impactful than "Responsible for increasing sales."
        </p>
      </div>
    </div>
  );
};

export default WorkExperienceSection;
