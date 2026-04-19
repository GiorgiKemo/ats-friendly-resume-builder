import React, { useState, useMemo } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';

const SkillsSection = ({ data = [], onChange }) => {
  const [newSkill, setNewSkill] = useState('');
  const [skillType, setSkillType] = useState('technical'); // 'technical' or 'soft'
  const [skillLevel, setSkillLevel] = useState('intermediate'); // 'beginner', 'intermediate', 'advanced', 'expert'

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      const skill = {
        name: newSkill.trim(),
        type: skillType,
        level: skillLevel
      };
      
      onChange([...data, skill]);
      setNewSkill('');
    }
  };

  const handleDeleteSkill = (index) => {
    const newData = [...data];
    newData.splice(index, 1);
    onChange(newData);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  // Group skills by type
  const technicalSkills = useMemo(() => data.filter(skill => skill.type === 'technical'), [data]);
  const softSkills = useMemo(() => data.filter(skill => skill.type === 'soft'), [data]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Skills</h2>
      
      {/* Add new skill form */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 mb-8">
        <h3 className="text-lg font-semibold mb-4">Add a Skill</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Skill Name"
              id="newSkill"
              name="newSkill"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="JavaScript, Project Management, etc."
              tooltip="Enter a specific skill you possess"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Skill Type
            </label>
            <select
              className="select-field"
              value={skillType}
              onChange={(e) => setSkillType(e.target.value)}
            >
              <option value="technical">Technical Skill</option>
              <option value="soft">Soft Skill</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Proficiency Level
            </label>
            <div className="flex space-x-2">
              {['beginner', 'intermediate', 'advanced', 'expert'].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`flex-1 py-2 px-3 rounded text-sm ${
                    skillLevel === level
                      ? 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/30'
                      : 'bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                  onClick={() => setSkillLevel(level)}
                  aria-label={`Set proficiency to ${level}`}
                  aria-pressed={skillLevel === level}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-end">
            <Button onClick={handleAddSkill} className="w-full">
              Add Skill
            </Button>
          </div>
        </div>
      </div>
      
      {/* Display skills */}
      <div className="space-y-6">
        {/* Technical Skills */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Technical Skills</h3>
          {technicalSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {technicalSkills.map((skill) => (
                <div
                  key={`tech-${skill.name}-${skill.level}`}
                  className="bg-gray-100 dark:bg-slate-700 rounded-full px-3 py-1 flex items-center group"
                >
                  <span className="mr-1">{skill.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    skill.level === 'beginner' ? 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-slate-300' :
                    skill.level === 'intermediate' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' :
                    skill.level === 'advanced' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' :
                    'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                  }`}>
                    {skill.level.charAt(0).toUpperCase()}
                  </span>
                  <button
                    onClick={() => handleDeleteSkill(data.indexOf(skill))}
                    className="ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                    aria-label={`Remove ${skill.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-slate-500 text-sm italic">No technical skills added yet</p>
          )}
        </div>
        
        {/* Soft Skills */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Soft Skills</h3>
          {softSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {softSkills.map((skill) => (
                <div
                  key={`soft-${skill.name}-${skill.level}`}
                  className="bg-gray-100 dark:bg-slate-700 rounded-full px-3 py-1 flex items-center group"
                >
                  <span className="mr-1">{skill.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    skill.level === 'beginner' ? 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-slate-300' :
                    skill.level === 'intermediate' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' :
                    skill.level === 'advanced' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' :
                    'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                  }`}>
                    {skill.level.charAt(0).toUpperCase()}
                  </span>
                  <button
                    onClick={() => handleDeleteSkill(data.indexOf(skill))}
                    className="ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                    aria-label={`Remove ${skill.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-slate-500 text-sm italic">No soft skills added yet</p>
          )}
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">ATS Tip</h3>
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Include both technical and soft skills that are relevant to the job. Use specific skill names rather than 
          general categories, and match the exact terminology used in job descriptions when possible.
        </p>
      </div>
    </div>
  );
};

export default SkillsSection;
