import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * InfoTooltip - A reusable tooltip component for displaying information icons with tooltips
 * 
 * @param {Object} props - Component props
 * @param {string} props.content - The tooltip content to display
 * @param {string} [props.position='top'] - The position of the tooltip (top, bottom, left, right)
 * @param {string} [props.className=''] - Additional CSS classes for the tooltip container
 * @returns {JSX.Element} - InfoTooltip component
 */
const InfoTooltip = ({ content, position = 'top', className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-1',
  };

  return (
    <div 
      className={`relative inline-block ml-1 ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <button
        type="button"
        className="cursor-help text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-full"
        aria-label={`Information: ${content}`}
        aria-expanded={isVisible}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4M12 8h.01"></path>
        </svg>
      </button>
      
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-10 w-48 px-3 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg shadow-sm transition-opacity duration-300 ${positionClasses[position]}`}
        >
          {content}
          <div
            className={`absolute ${
              position === 'top'
                ? 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-800'
                : position === 'bottom'
                ? 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-800'
                : position === 'left'
                ? 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-800'
                : 'right-full top-1/2 transform -translate-y-1/2 border-r-gray-800'
            } border-solid border-4 border-transparent`}
            aria-hidden="true"
          ></div>
        </div>
      )}
    </div>
  );
};

InfoTooltip.propTypes = {
  content: PropTypes.string.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  className: PropTypes.string
};

export default InfoTooltip;
