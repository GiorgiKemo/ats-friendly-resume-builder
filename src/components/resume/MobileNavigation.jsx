import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import MobileProgressIndicator from '../ui/MobileProgressIndicator';
import ResumeSectionIcon from './ResumeSectionIcon';
import ResumeSectionStatusBadge from './ResumeSectionStatusBadge';

const MobileNavigation = ({ sections, activeSection, setActiveSection }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { isDark } = useTheme();
  const selectedSectionClasses = isDark
    ? 'bg-slate-700/80 text-blue-300 ring-1 ring-blue-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] font-medium'
    : 'bg-blue-100 text-blue-700 font-medium';
  const unselectedSectionClasses = isDark
    ? 'text-slate-100 hover:bg-slate-700/80'
    : 'text-slate-900 hover:bg-gray-100';

  const handleSectionChange = (section) => {
    if (!section.disabled) {
      setActiveSection(section.id);
      setIsOpen(false);
    }
  };

  const activeSectionData = sections.find((section) => section.id === activeSection);

  // Calculate previous and next sections for navigation (These were unused)
  // const currentIndex = sections.findIndex(s => s.id === activeSection);
  // const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
  // const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;

  return (
    <div className="md:hidden mb-6">
      {/* Progress Indicator */}
      <MobileProgressIndicator
        sections={sections}
        activeSection={activeSection}
        className="mb-4"
      />

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl px-4 py-3 text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                <ResumeSectionIcon icon={activeSectionData?.icon} className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {activeSectionData?.label || 'Select Section'}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-slate-400">
                  {activeSectionData?.detail || 'Choose where to work next'}
                </span>
              </span>
            </span>
          </span>
          <svg
            className={`ml-3 h-5 w-5 flex-shrink-0 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-[70vh] overflow-y-auto">
            <ul className="py-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    className={`w-full text-left px-4 py-2 text-sm flex items-center ${activeSection === section.id
                      ? selectedSectionClasses
                      : section.disabled
                        ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed'
                        : unselectedSectionClasses
                      }`}
                    onClick={() => handleSectionChange(section)}
                    disabled={section.disabled}
                  >
                    <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      <ResumeSectionIcon icon={section.icon} className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{section.label}</span>
                      {section.detail && (
                        <span className="block truncate text-xs text-gray-500 dark:text-slate-400">
                          {section.detail}
                        </span>
                      )}
                    </span>
                    <span className="ml-3 flex-shrink-0">
                      {section.disabled ? (
                        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-300">Soon</span>
                      ) : (
                        <ResumeSectionStatusBadge section={section} />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Note: Previous/Next Navigation removed as it's now in the sticky bottom bar */}
    </div>
  );
};

export default MobileNavigation;
