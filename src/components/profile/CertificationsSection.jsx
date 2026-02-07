import React, { useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const CertificationsSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    name: '',
    issuer: '',
    issueDate: '',
    expirationDate: '',
    noExpiration: false,
    credentialID: '',
    credentialURL: '',
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
    if (window.confirm('Are you sure you want to delete this certification?')) {
      const newData = [...data];
      newData.splice(index, 1);
      onChange(newData);
    }
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      name: '',
      issuer: '',
      issueDate: '',
      expirationDate: '',
      noExpiration: false,
      credentialID: '',
      credentialURL: '',
      description: ''
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Certifications</h2>
      
      {/* List existing certifications */}
      {data.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Your Certifications</h3>
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{item.name}</h4>
                    <p className="text-gray-600">Issued by {item.issuer}</p>
                    <p className="text-sm text-gray-500">
                      Issued: {item.issueDate}
                      {item.noExpiration 
                        ? ' (No Expiration)' 
                        : item.expirationDate ? ` • Expires: ${item.expirationDate}` : ''}
                    </p>
                    {item.credentialURL && (
                      <a 
                        href={item.credentialURL} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Credential
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
      
      {/* Form to add/edit certification */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Certification' : 'Add Certification'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Certification Name"
            id="name"
            name="name"
            value={currentItem.name}
            onChange={handleInputChange}
            required
            tooltip="The full name of the certification"
            placeholder="AWS Certified Solutions Architect"
          />
          
          <Input
            label="Issuing Organization"
            id="issuer"
            name="issuer"
            value={currentItem.issuer}
            onChange={handleInputChange}
            required
            tooltip="The organization that issued the certification"
            placeholder="Amazon Web Services"
          />
          
          <Input
            label="Issue Date"
            id="issueDate"
            name="issueDate"
            type="month"
            value={currentItem.issueDate}
            onChange={handleInputChange}
            required
            tooltip="When you received this certification"
          />
          
          <div className="flex flex-col">
            <Input
              label="Expiration Date"
              id="expirationDate"
              name="expirationDate"
              type="month"
              value={currentItem.expirationDate}
              onChange={handleInputChange}
              disabled={currentItem.noExpiration}
              tooltip="When this certification expires (if applicable)"
            />
            <div className="mt-1 flex items-center">
              <input
                type="checkbox"
                id="noExpiration"
                name="noExpiration"
                checked={currentItem.noExpiration}
                onChange={handleInputChange}
                className="mr-2"
              />
              <label htmlFor="noExpiration" className="text-sm text-gray-700">
                This certification does not expire
              </label>
            </div>
          </div>
          
          <Input
            label="Credential ID"
            id="credentialID"
            name="credentialID"
            value={currentItem.credentialID}
            onChange={handleInputChange}
            tooltip="The unique identifier for this certification (if available)"
            placeholder="ABC123XYZ"
          />
          
          <Input
            label="Credential URL"
            id="credentialURL"
            name="credentialURL"
            type="url"
            value={currentItem.credentialURL}
            onChange={handleInputChange}
            tooltip="Link to verify this certification online (if available)"
            placeholder="https://www.example.com/verify/ABC123XYZ"
          />
          
          <div className="md:col-span-2">
            <Textarea
              label="Description"
              id="description"
              name="description"
              value={currentItem.description}
              onChange={handleInputChange}
              rows={3}
              tooltip="Additional details about this certification (optional)"
              placeholder="Brief description of the certification, skills covered, or notable achievements"
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
            {editIndex !== null ? 'Update' : 'Add'} Certification
          </Button>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tip</h3>
        <p className="text-sm text-blue-700">
          Include the full name of certifications without abbreviations. If the certification is well-known in your 
          industry, it can help your resume pass through ATS filters for specific qualifications.
        </p>
      </div>
    </div>
  );
};

export default CertificationsSection;
