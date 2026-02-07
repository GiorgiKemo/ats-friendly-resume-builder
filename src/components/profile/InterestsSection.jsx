import React, { useState } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';

const InterestsSection = ({ data = [], onChange }) => {
  const [newInterest, setNewInterest] = useState('');

  const handleAddInterest = () => {
    if (newInterest.trim()) {
      onChange([...data, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleDeleteInterest = (index) => {
    const newData = [...data];
    newData.splice(index, 1);
    onChange(newData);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInterest();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Interests</h2>
      
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold mb-4">Add an Interest</h3>
        <div className="flex space-x-2">
          <Input
            label=""
            id="newInterest"
            name="newInterest"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Photography, Hiking, Chess, etc."
            tooltip="Enter a personal interest or hobby"
            className="flex-grow"
          />
          <div className="flex items-end">
            <Button onClick={handleAddInterest}>Add</Button>
          </div>
        </div>
      </div>
      
      {data.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold mb-3">Your Interests</h3>
          <div className="flex flex-wrap gap-2">
            {data.map((interest, index) => (
              <div 
                key={index} 
                className="bg-white border border-gray-200 rounded-full px-3 py-1 flex items-center group"
              >
                <span>{interest}</span>
                <button
                  onClick={() => handleDeleteInterest(index)}
                  className="ml-2 text-gray-400 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm italic">No interests added yet</p>
      )}
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">Why Include Interests?</h3>
        <p className="text-sm text-blue-700">
          While optional, interests can add a personal touch to your resume and can be conversation starters during 
          interviews. They can also demonstrate relevant soft skills or show cultural fit with certain organizations.
        </p>
        <p className="text-sm text-blue-700 mt-2">
          Consider including interests that demonstrate valuable qualities like teamwork (team sports), 
          creativity (art, music), or continuous learning (reading, online courses).
        </p>
      </div>
    </div>
  );
};

export default InterestsSection;
