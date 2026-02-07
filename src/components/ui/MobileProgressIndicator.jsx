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

  const progress = ((activeIndex + 1) / sections.length) * 100;

  return (
    <div
      className={`md:hidden mb-4 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={`Step ${activeIndex + 1} of ${sections.length}, ${Math.round(progress)}% complete`}
    >
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>Step {activeIndex + 1} of {sections.length}</span>
        <span>{Math.round(progress)}% Complete</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};

MobileProgressIndicator.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired
    })
  ).isRequired,
  activeSection: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired,
  className: PropTypes.string
};

export default React.memo(MobileProgressIndicator);
