import React from 'react';
import PropTypes from 'prop-types';

/**
 * MobileProgressIndicator - A mobile-friendly progress indicator for multi-step processes
 *
 * @param {Object} props - Component props
 * @param {Array} props.sections - Array of sections
 * @param {string|number} props.activeSection - ID or index of the active section
 * @param {string} [props.className] - Additional CSS classes
 * @returns {JSX.Element} - MobileProgressIndicator component
 */
const MobileProgressIndicator = ({ sections, activeSection, className = '' }) => {
  const activeIndex = typeof activeSection === 'number'
    ? activeSection
    : sections.findIndex(s => s.id === activeSection);

  const progressSections = sections.filter((section) => section.required);
  const completedSections = progressSections.filter((section) => section.complete).length;
  const progress = progressSections.length > 0
    ? (completedSections / progressSections.length) * 100
    : ((activeIndex + 1) / sections.length) * 100;
  const activeSectionData = sections[activeIndex];
  const currentSectionStatus = activeSectionData?.complete
    ? 'Ready'
    : activeSectionData?.inProgress
      ? 'In progress'
      : activeSectionData?.optional
        ? 'Optional'
        : 'Needs attention';

  return (
    <div
      className={`md:hidden mb-4 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={`${completedSections} of ${progressSections.length} core sections ready, ${Math.round(progress)}% complete`}
    >
      <div className="flex justify-between text-sm text-gray-600 dark:text-slate-300 mb-1">
        <span>{completedSections} of {progressSections.length} core sections ready</span>
        <span>{Math.round(progress)}% Complete</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-[width,background-color] duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      {activeSectionData && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span className="truncate pr-3">{activeSectionData.label}</span>
          <span>{currentSectionStatus}</span>
        </div>
      )}
    </div>
  );
};

MobileProgressIndicator.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string,
      required: PropTypes.bool,
      complete: PropTypes.bool,
      inProgress: PropTypes.bool,
      optional: PropTypes.bool,
    })
  ).isRequired,
  activeSection: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired,
  className: PropTypes.string
};

export default React.memo(MobileProgressIndicator);
