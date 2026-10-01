import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * InfoTooltip - A small information icon that reveals a floating hint.
 *
 * The hint floats above the page, so opening it never moves the surrounding
 * form. The icon is drawn at 16px but keeps a 44px touch target through an
 * invisible pseudo-element, so it does not make the label row taller.
 *
 * @param {Object} props - Component props
 * @param {string} props.content - The tooltip content to display
 * @param {string} [props.position='top'] - top, bottom, left, right; 'inline' is
 *   kept for form labels and floats above, aligned to the icon
 * @param {string} [props.className=''] - Additional CSS classes for the tooltip container
 * @returns {JSX.Element} - InfoTooltip component
 */
const InfoTooltip = ({ content, position = 'top', className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    // Form labels: start at the icon so the hint stays inside narrow columns.
    inline: 'bottom-full -left-2 mb-2',
  };
  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900',
    inline: 'top-full left-3 border-t-slate-900',
  };

  return (
    <span
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setIsVisible(false);
        }
      }}
    >
      <button
        type="button"
        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full cursor-help text-slate-400 transition-colors hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 before:absolute before:-inset-3.5 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        aria-label="More information"
        aria-expanded={isVisible}
        aria-describedby={isVisible ? tooltipId : undefined}
        onClick={() => setIsVisible(true)}
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
        <span
          role="tooltip"
          id={tooltipId}
          className={`pointer-events-none absolute ${positionClasses[position] || positionClasses.top} z-50 block w-max max-w-[16rem] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg shadow-slate-900/20 ring-1 ring-white/10`}
        >
          {content}
          <span
            className={`absolute ${arrowClasses[position] || arrowClasses.top} border-solid border-[5px] border-transparent`}
            aria-hidden="true"
          ></span>
        </span>
      )}
    </span>
  );
};

InfoTooltip.propTypes = {
  content: PropTypes.string.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right', 'inline']),
  className: PropTypes.string
};

export default InfoTooltip;
