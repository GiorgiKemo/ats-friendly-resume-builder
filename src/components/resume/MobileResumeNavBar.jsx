import React, { useState, useRef, useEffect, useId } from 'react';
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
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const disclosureId = useId();
  const { isDark } = useTheme();
  const selectedSectionClasses = isDark
    ? 'bg-slate-700/80 text-blue-300 ring-1 ring-blue-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] font-medium'
    : 'bg-blue-100 text-blue-700 font-medium';
  const unselectedSectionClasses = isDark
    ? 'text-slate-100 hover:bg-slate-700/80'
    : 'text-slate-900 hover:bg-gray-100';

  const currentIndex = sections.findIndex((section) => section.id === activeSection);
  const currentSection = sections[currentIndex];
  const prevSection = currentIndex > 0
    ? sections.slice(0, currentIndex).reverse().find((section) => !section.disabled) : null;
  const nextSection = currentIndex >= 0
    ? sections.slice(currentIndex + 1).find((section) => !section.disabled) : null;

  useEffect(() => {
    if (!isDropdownOpen) return undefined;
    const selectedButton = panelRef.current?.querySelector('button[aria-current="step"]:not(:disabled)');
    const firstButton = panelRef.current?.querySelector('button:not(:disabled)');
    (selectedButton || firstButton)?.focus();
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleSectionChange = (sectionId, restoreFocus = false) => {
    const section = sections.find((item) => item.id === sectionId);
    if (!section || section.disabled) return;
    setActiveSection(sectionId);
    setIsDropdownOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && isDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsDropdownOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <nav aria-label="Resume section navigation" className="app-builder-mobile-nav md:hidden border-t border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
        <div id={disclosureId} ref={panelRef} hidden={!isDropdownOpen} className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm ${activeSection === section.id
                    ? selectedSectionClasses
                    : section.disabled ? 'cursor-not-allowed text-gray-400 dark:text-slate-500' : unselectedSectionClasses
                    }`}
                  onClick={() => handleSectionChange(section.id, true)}
                  disabled={section.disabled}
                  aria-current={activeSection === section.id ? 'step' : undefined}
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

        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => prevSection && handleSectionChange(prevSection.id)}
            disabled={!prevSection}
            className={`flex h-12 w-12 items-center justify-center ${prevSection
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-slate-600'
              }`}
            aria-label="Previous section"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="sr-only">Previous</span>
          </button>

          <button
            type="button"
            ref={triggerRef}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-controls={disclosureId}
            aria-label={`Resume sections, current: ${currentSection?.label || 'none selected'}`}
            disabled={sections.length === 0}
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
              aria-hidden="true"
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
            type="button"
            onClick={() => nextSection && handleSectionChange(nextSection.id)}
            disabled={!nextSection}
            className={`flex h-12 w-12 items-center justify-center ${nextSection
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-slate-600'
              }`}
            aria-label="Next section"
          >
            <span className="sr-only">Next</span>
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
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
      disabled: PropTypes.bool,
    })
  ).isRequired,
  activeSection: PropTypes.string.isRequired,
  setActiveSection: PropTypes.func.isRequired,
};

export default MobileResumeNavBar;
