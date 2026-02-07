import React, { useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import PhoneInputWithCountry from '../ui/PhoneInputWithCountry';

const ReferencesSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    name: '',
    title: '',
    company: '',
    email: '',
    phone: '',
    relationship: '',
    notes: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({
      ...prev,
      [name]: value
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
    if (window.confirm('Are you sure you want to delete this reference?')) {
      const newData = [...data];
      newData.splice(index, 1);
      onChange(newData);
    }
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      name: '',
      title: '',
      company: '',
      email: '',
      phone: '',
      relationship: '',
      notes: ''
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">References</h2>

      <div className="bg-yellow-50 p-4 rounded-md mb-6">
        <h3 className="font-medium text-yellow-800 mb-2">Important Note</h3>
        <p className="text-sm text-yellow-700">
          References are typically not included directly on your resume. Instead, prepare a separate reference sheet
          to provide when requested. This section helps you organize your references for when they're needed.
        </p>
        <p className="text-sm text-yellow-700 mt-2">
          Always ask permission before listing someone as a reference, and give them a heads-up when you're actively
          applying for jobs so they can be prepared for potential calls.
        </p>
      </div>

      {/* List existing references */}
      {data.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Your References</h3>
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{item.name}</h4>
                    <p className="text-gray-600">{item.title}, {item.company}</p>
                    {item.relationship && (
                      <p className="text-sm text-gray-500">Relationship: {item.relationship}</p>
                    )}
                    <div className="mt-2">
                      {item.email && (
                        <p className="text-sm">
                          <span className="font-medium">Email:</span> {item.email}
                        </p>
                      )}
                      {item.phone && (
                        <p className="text-sm">
                          <span className="font-medium">Phone:</span> {item.phone}
                        </p>
                      )}
                    </div>
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
                {item.notes && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600">{item.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form to add/edit reference */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Reference' : 'Add Reference'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Full Name"
            id="name"
            name="name"
            value={currentItem.name}
            onChange={handleInputChange}
            required
            tooltip="The full name of your reference"
            placeholder="Jane Smith"
          />

          <Input
            label="Title/Position"
            id="title"
            name="title"
            value={currentItem.title}
            onChange={handleInputChange}
            required
            tooltip="Their job title or position"
            placeholder="Senior Manager"
          />

          <Input
            label="Company/Organization"
            id="company"
            name="company"
            value={currentItem.company}
            onChange={handleInputChange}
            required
            tooltip="Where they work"
            placeholder="Acme Corporation"
          />

          <Input
            label="Relationship"
            id="relationship"
            name="relationship"
            value={currentItem.relationship}
            onChange={handleInputChange}
            tooltip="How you know this person"
            placeholder="Former Manager, Colleague, Professor, etc."
          />

          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            value={currentItem.email}
            onChange={handleInputChange}
            tooltip="Their email address"
            placeholder="jane.smith@example.com"
          />

          <PhoneInputWithCountry
            label="Phone"
            id="phone"
            name="phone"
            value={currentItem.phone}
            onChange={handleInputChange}
            tooltip="Select country code and enter their phone number"
            placeholder="Phone number"
          />

          <div className="md:col-span-2">
            <Textarea
              label="Notes"
              id="notes"
              name="notes"
              value={currentItem.notes}
              onChange={handleInputChange}
              rows={3}
              tooltip="Additional information about this reference (for your records only)"
              placeholder="Notes about what projects you worked on together, specific achievements they can speak to, etc."
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
            {editIndex !== null ? 'Update' : 'Add'} Reference
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReferencesSection;
