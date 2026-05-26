import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../../context/ThemeContext';
import ResumeSectionIcon from './ResumeSectionIcon';
import ResumeSectionStatusBadge from './ResumeSectionStatusBadge';

/**
 * MobileResumeNavBar - A sticky bottom navigation bar for mobile resume builder
 * Allows users to navigate between resume sections without scrolling up
 */
const MobileResumeNavBar = ({ sections, activeSection, setActiveSection }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { isDark } = useTheme();
  const selectedSectionClasses = isDark
    ? 'bg-slate-700/80 text-blue-300 ring-1 ring-blue-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] font-medium'
    : 'bg-blue-100 text-blue-700 font-medium';
  const unselectedSectionClasses = isDark
    ? 'text-slate-100 hover:bg-slate-700/80'
    : 'text-slate-900 hover:bg-gray-100';

  const currentIndex = sections.findIndex((section) => section.id === activeSection);
  const currentSection = sections[currentIndex];
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    setIsDropdownOpen(false);
  };

  return (
    <div className="app-builder-mobile-nav md:hidden border-t border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="relative" ref={dropdownRef}>
        {isDropdownOpen && (
          <div className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm ${activeSection === section.id
                      ? selectedSectionClasses
                      : unselectedSectionClasses
                      }`}
                    onClick={() => handleSectionChange(section.id)}
                  >
                    <span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
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
                    <ResumeSectionStatusBadge section={section} className="ml-3 flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => prevSection && handleSectionChange(prevSection.id)}
            disabled={!prevSection}
            className={`flex h-12 w-12 items-center justify-center ${prevSection
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-slate-600'
              }`}
            aria-label="Previous section"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="sr-only">Previous</span>
          </button>

          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="mx-2 flex max-w-[220px] flex-grow items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-gray-800 dark:bg-slate-700 dark:text-slate-100"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400">
              <ResumeSectionIcon icon={currentSection?.icon} className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">
                {currentSection ? currentSection.label : 'Select Section'}
              </span>
              <span className="block truncate text-[11px] text-gray-500 dark:text-slate-400">
                {currentSection?.detail || 'Move through your resume sections'}
              </span>
            </span>
            {currentSection && (
              <ResumeSectionStatusBadge section={currentSection} showText={false} className="flex-shrink-0" />
            )}
            <svg
              className={`h-4 w-4 flex-shrink-0 transition-transform ${isDropdownOpen ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>

          <button
            onClick={() => nextSection && handleSectionChange(nextSection.id)}
            disabled={!nextSection}
            className={`flex h-12 w-12 items-center justify-center ${nextSection
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-slate-600'
              }`}
            aria-label="Next section"
          >
            <span className="sr-only">Next</span>
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

MobileResumeNavBar.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.string,
      detail: PropTypes.string,
      complete: PropTypes.bool,
      inProgress: PropTypes.bool,
      optional: PropTypes.bool,
    })
  ).isRequired,
  activeSection: PropTypes.string.isRequired,
  setActiveSection: PropTypes.func.isRequired,
};

export default MobileResumeNavBar;
