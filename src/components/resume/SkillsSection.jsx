import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
// import Input from '../ui/Input'; // Input component was unused
import Button from '../ui/Button';

const SkillsSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { skills = [] } = currentResume;

  const [newSkill, setNewSkill] = useState('');
  const [error, setError] = useState('');

  const handleAddSkill = () => {
    if (!newSkill.trim()) {
      setError('Please enter a skill');
      return;
    }

    setError('');
    const updatedSkills = Array.isArray(skills) ? [...skills] : [];
    updatedSkills.push(newSkill.trim());
    updateCurrentResume({ skills: updatedSkills });
    setNewSkill('');
  };

  const handleRemoveSkill = (index) => {
    const updatedSkills = [...skills];
    updatedSkills.splice(index, 1);
    updateCurrentResume({ skills: updatedSkills });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Skills</h2>

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label htmlFor="newSkill" className="block text-sm font-medium text-gray-700 mb-1">
              Add a Skill
              <div className="relative inline-block ml-1 group">
                <span className="cursor-help text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4M12 8h.01"></path>
                  </svg>
                </span>
                <div className="invisible group-hover:visible absolute z-10 w-48 bg-gray-800 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bottom-full left-1/2 transform -translate-x-1/2 mb-1">
                  Add relevant technical and soft skills
                </div>
              </div>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="newSkill"
                type="text"
                placeholder="e.g., JavaScript, Project Management, Data Analysis"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
              />
              <div className="flex">
                <Button onClick={handleAddSkill} className="w-full sm:w-auto">
                  Add
                </Button>
              </div>
            </div>
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>

        <p className="mt-2 text-sm text-gray-500">
          Press Enter to add a skill or click the Add button
        </p>
      </div>

      {Array.isArray(skills) && skills.length > 0 ? (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Your Skills</h3>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <div
                key={index}
                className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full flex items-center"
              >
                <span>{skill}</span>
                <button
                  onClick={() => handleRemoveSkill(index)}
                  className="ml-2 text-blue-500 hover:text-blue-700"
                  aria-label={`Remove ${skill}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 p-8 rounded-lg text-center mb-6">
          <p className="text-gray-600 mb-4">You haven't added any skills yet.</p>
          <p className="text-sm text-gray-500">
            Add skills that are relevant to the job you're applying for.
          </p>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">ATS Tips for Skills</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>Include both hard skills (technical abilities) and soft skills (interpersonal abilities)</li>
          <li>Match skills exactly as they appear in the job description</li>
          <li>Use industry-standard terminology (e.g., "Microsoft Excel" instead of just "Excel")</li>
          <li>Include skill proficiency levels when relevant (e.g., "Advanced JavaScript")</li>
          <li>For technical roles, include specific programming languages, tools, and technologies</li>
          <li>For non-technical roles, focus on relevant software, methodologies, and transferable skills</li>
        </ul>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-medium text-yellow-800 mb-2">Common ATS-Friendly Skills by Industry</h3>

        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div>
            <h4 className="font-medium text-yellow-700 mb-1">Technology</h4>
            <p className="text-sm text-yellow-600">
              JavaScript, Python, React, SQL, AWS, DevOps, Agile, UI/UX, Machine Learning, Data Analysis
            </p>
          </div>

          <div>
            <h4 className="font-medium text-yellow-700 mb-1">Marketing</h4>
            <p className="text-sm text-yellow-600">
              SEO, Content Marketing, Social Media Management, Google Analytics, Email Marketing, CRM, Adobe Creative Suite
            </p>
          </div>

          <div>
            <h4 className="font-medium text-yellow-700 mb-1">Finance</h4>
            <p className="text-sm text-yellow-600">
              Financial Analysis, Excel, QuickBooks, Forecasting, Risk Assessment, Budgeting, Financial Reporting
            </p>
          </div>

          <div>
            <h4 className="font-medium text-yellow-700 mb-1">Healthcare</h4>
            <p className="text-sm text-yellow-600">
              Patient Care, Electronic Medical Records (EMR), HIPAA Compliance, Medical Terminology, Clinical Documentation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsSection;
