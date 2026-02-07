import React, { useState, useId } from 'react';
import PropTypes from 'prop-types';

/**
 * MobileAccordion - A mobile-friendly accordion component for collapsible content
 * Follows WAI-ARIA Accordion Pattern for accessibility
 *
 * @param {Object} props - Component props
 * @param {string} props.title - Accordion title
 * @param {React.ReactNode} props.children - Accordion content
 * @param {boolean} [props.defaultOpen=false] - Whether the accordion is open by default
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.id] - Optional ID for the accordion (auto-generated if not provided)
 * @returns {JSX.Element} - MobileAccordion component
 */
const MobileAccordion = ({ title, children, defaultOpen = false, className = '', id }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const uniqueId = useId();
  const accordionId = id || uniqueId;
  const headingId = `accordion-heading-${accordionId}`;
  const contentId = `accordion-content-${accordionId}`;

  return (
    <div className={`border-b border-gray-200 py-3 ${className}`}>
      <h3>
        <button
          className="flex justify-between items-center w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-2 py-1"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          id={headingId}
        >
          <span className="font-medium">{title}</span>
          <svg
            className={`w-5 h-5 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>

      <div
        id={contentId}
        role="region"
        aria-labelledby={headingId}
        className={`mt-2 text-sm text-gray-600 transition-all duration-200 ease-in-out overflow-hidden ${isOpen ? 'max-h-96' : 'max-h-0 hidden'}`}
      >
        {isOpen && children}
      </div>
    </div>
  );
};

MobileAccordion.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  defaultOpen: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string
};

export default React.memo(MobileAccordion);
