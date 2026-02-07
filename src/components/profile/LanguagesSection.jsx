import React, { useState } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';

const LanguagesSection = ({ data = [], onChange }) => {
  const [editIndex, setEditIndex] = useState(null);
  const [currentItem, setCurrentItem] = useState({
    name: '',
    proficiency: 'intermediate', // 'beginner', 'intermediate', 'advanced', 'native'
    type: 'spoken' // 'spoken' or 'programming'
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProficiencyChange = (proficiency) => {
    setCurrentItem(prev => ({
      ...prev,
      proficiency
    }));
  };

  const handleTypeChange = (type) => {
    setCurrentItem(prev => ({
      ...prev,
      type
    }));
  };

  const handleAddOrUpdate = () => {
    if (!currentItem.name.trim()) return;
    
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
    const newData = [...data];
    newData.splice(index, 1);
    onChange(newData);
  };

  const resetForm = () => {
    setEditIndex(null);
    setCurrentItem({
      name: '',
      proficiency: 'intermediate',
      type: 'spoken'
    });
  };

  // Group languages by type
  const spokenLanguages = data.filter(lang => lang.type === 'spoken');
  const programmingLanguages = data.filter(lang => lang.type === 'programming');

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Languages</h2>
      
      {/* Add new language form */}
      <div className="bg-gray-50 rounded-lg p-4 mb-8">
        <h3 className="text-lg font-semibold mb-4">
          {editIndex !== null ? 'Edit Language' : 'Add Language'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Language Name"
              id="name"
              name="name"
              value={currentItem.name}
              onChange={handleInputChange}
              required
              tooltip="Enter a language you know"
              placeholder="English, Spanish, Python, JavaScript, etc."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language Type
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded text-sm ${
                  currentItem.type === 'spoken'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => handleTypeChange('spoken')}
              >
                Spoken Language
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded text-sm ${
                  currentItem.type === 'programming'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => handleTypeChange('programming')}
              >
                Programming Language
              </button>
            </div>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proficiency Level
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {currentItem.type === 'spoken' ? (
                <>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'beginner'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('beginner')}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'intermediate'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('intermediate')}
                  >
                    Intermediate
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'advanced'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('advanced')}
                  >
                    Advanced
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'native'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('native')}
                  >
                    Native
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'beginner'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('beginner')}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'intermediate'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('intermediate')}
                  >
                    Intermediate
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'advanced'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('advanced')}
                  >
                    Advanced
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded text-sm ${
                      currentItem.proficiency === 'expert'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => handleProficiencyChange('expert')}
                  >
                    Expert
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end space-x-2">
          {editIndex !== null && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
          <Button onClick={handleAddOrUpdate}>
            {editIndex !== null ? 'Update' : 'Add'} Language
          </Button>
        </div>
      </div>
      
      {/* Display languages */}
      <div className="space-y-6">
        {/* Spoken Languages */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Spoken Languages</h3>
          {spokenLanguages.length > 0 ? (
            <div className="overflow-hidden bg-white shadow sm:rounded-lg">
              <ul className="divide-y divide-gray-200">
                {spokenLanguages.map((lang, index) => (
                  <li key={index} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{lang.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({lang.proficiency === 'native' ? 'Native' : 
                          lang.proficiency === 'advanced' ? 'Advanced' : 
                          lang.proficiency === 'intermediate' ? 'Intermediate' : 'Basic'})
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEdit(data.indexOf(lang))}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(data.indexOf(lang))}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">No spoken languages added yet</p>
          )}
        </div>
        
        {/* Programming Languages */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Programming Languages</h3>
          {programmingLanguages.length > 0 ? (
            <div className="overflow-hidden bg-white shadow sm:rounded-lg">
              <ul className="divide-y divide-gray-200">
                {programmingLanguages.map((lang, index) => (
                  <li key={index} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{lang.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({lang.proficiency === 'expert' ? 'Expert' : 
                          lang.proficiency === 'advanced' ? 'Advanced' : 
                          lang.proficiency === 'intermediate' ? 'Intermediate' : 'Basic'})
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEdit(data.indexOf(lang))}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(data.indexOf(lang))}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">No programming languages added yet</p>
          )}
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tip</h3>
        <p className="text-sm text-blue-700">
          For spoken languages, include your proficiency level. For programming languages, focus on those relevant 
          to the job you're applying for. Both can be valuable keywords for ATS systems.
        </p>
      </div>
    </div>
  );
};

export default LanguagesSection;
