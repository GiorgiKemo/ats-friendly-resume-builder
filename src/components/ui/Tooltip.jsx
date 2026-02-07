import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Tooltip - A component that displays a tooltip when hovering over its children
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - The element that triggers the tooltip
 * @param {string} props.content - The content to display in the tooltip
 * @param {string} [props.position='top'] - The position of the tooltip (top, bottom, left, right)
 * @returns {JSX.Element} - Tooltip component
 */
const Tooltip = ({ children, content, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-flex items-center cursor-help"
        tabIndex="0"
        role="button"
        aria-expanded={isVisible}
      >
        {children}
      </div>
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm opacity-100 tooltip ${positionClasses[position]}`}
          style={{ maxWidth: '250px' }}
        >
          {content}
          <div
            className={`absolute ${
              position === 'top'
                ? 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-900'
                : position === 'bottom'
                ? 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-900'
                : position === 'left'
                ? 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-900'
                : 'right-full top-1/2 transform -translate-y-1/2 border-r-gray-900'
            } border-solid border-4 border-transparent`}
            aria-hidden="true"
          ></div>
        </div>
      )}
    </div>
  );
};

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right'])
};

export default Tooltip;
