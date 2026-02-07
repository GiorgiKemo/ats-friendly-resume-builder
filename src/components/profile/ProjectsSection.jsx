import React, { useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const ProjectsSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    title: '',
    role: '',
    startDate: '',
    endDate: '',
    current: false,
    url: '',
    technologies: '',
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
    if (window.confirm('Are you sure you want to delete this project?')) {
      const newData = [...data];
      newData.splice(index, 1);
      onChange(newData);
    }
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      title: '',
      role: '',
      startDate: '',
      endDate: '',
      current: false,
      url: '',
      technologies: '',
      description: ''
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Projects</h2>
      
      {/* List existing projects */}
      {data.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Your Projects</h3>
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{item.title}</h4>
                    {item.role && <p className="text-gray-600">Role: {item.role}</p>}
                    <p className="text-sm text-gray-500">
                      {item.startDate} - {item.current ? 'Present' : item.endDate}
                    </p>
                    {item.technologies && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Technologies:</span> {item.technologies}
                      </p>
                    )}
                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                      >
                        View Project
                      </a>
                    )}
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
      
      {/* Form to add/edit project */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Project' : 'Add Project'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Project Title"
            id="title"
            name="title"
            value={currentItem.title}
            onChange={handleInputChange}
            required
            tooltip="The name of your project"
            placeholder="E-commerce Website Redesign"
          />
          
          <Input
            label="Your Role"
            id="role"
            name="role"
            value={currentItem.role}
            onChange={handleInputChange}
            tooltip="Your role or position in this project"
            placeholder="Lead Developer"
          />
          
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Start Date"
              id="startDate"
              name="startDate"
              type="month"
              value={currentItem.startDate}
              onChange={handleInputChange}
              tooltip="When you started this project"
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
                tooltip="When you completed this project"
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
                  This is an ongoing project
                </label>
              </div>
            </div>
          </div>
          
          <Input
            label="Project URL"
            id="url"
            name="url"
            type="url"
            value={currentItem.url}
            onChange={handleInputChange}
            tooltip="Link to the project website, repository, or documentation"
            placeholder="https://github.com/username/project"
          />
          
          <Input
            label="Technologies Used"
            id="technologies"
            name="technologies"
            value={currentItem.technologies}
            onChange={handleInputChange}
            tooltip="List the key technologies, languages, or tools used"
            placeholder="React, Node.js, MongoDB, AWS"
          />
          
          <div className="md:col-span-2">
            <Textarea
              label="Project Description"
              id="description"
              name="description"
              value={currentItem.description}
              onChange={handleInputChange}
              rows={4}
              tooltip="Describe the project, your contributions, and outcomes"
              placeholder="• Developed a responsive e-commerce website with React and Node.js
• Implemented secure payment processing with Stripe API
• Improved page load speed by 40% through code optimization
• Resulted in 25% increase in conversion rate"
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
            {editIndex !== null ? 'Update' : 'Add'} Project
          </Button>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tip</h3>
        <p className="text-sm text-blue-700">
          Focus on projects that demonstrate skills relevant to the job you're applying for. Use action verbs and 
          quantify results when possible. Include links to live projects or repositories when available.
        </p>
      </div>
    </div>
  );
};

export default ProjectsSection;
