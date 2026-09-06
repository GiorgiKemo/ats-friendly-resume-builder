import React, { useId } from 'react';

const MobileNavigation = ({ sections, activeSection, setActiveSection }) => {
  const selectId = useId();
  const hasActiveSection = sections.some((section) => section.id === activeSection);

  const handleSectionChange = (event) => {
    const section = sections.find((item) => item.id === event.target.value);
    if (section && !section.disabled) setActiveSection(section.id);
  };

  return (
    <div className="mb-4 md:hidden">
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
        Resume section
      </label>
      <select
        id={selectId}
        name="resumeSection"
        value={hasActiveSection ? activeSection : ''}
        onChange={handleSectionChange}
        className="select-field w-full"
        disabled={sections.length === 0}
      >
        <option value="" disabled>Choose a section</option>
        {sections.map((section) => (
          <option key={section.id} value={section.id} disabled={section.disabled}>
            {section.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MobileNavigation;
