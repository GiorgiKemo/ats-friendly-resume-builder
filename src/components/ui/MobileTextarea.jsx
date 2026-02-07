import React from 'react';
import PropTypes from 'prop-types';

/**
 * MobileTextarea - A mobile-optimized textarea with larger touch targets
 * Follows WCAG touch target size recommendations
 *
 * @param {Object} props - Component props
 * @param {string} props.label - Field label
 * @param {string} [props.id] - Textarea ID (used for label association)
 * @param {string} [props.error] - Error message
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.required=false] - Whether the field is required
 * @param {number} [props.rows=4] - Number of rows
 * @returns {JSX.Element} - MobileTextarea component
 */
const MobileTextarea = ({
  label,
  id,
  error,
  className = '',
  required = false,
  rows = 4,
  ...props
}) => {
  // Generate a unique ID if none is provided
  const textareaId = id || `mobile-textarea-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div className={`mb-4 ${className}`}>
      <label
        htmlFor={textareaId}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        id={textareaId}
        className={`w-full px-4 py-3 text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        rows={rows}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={errorId}
        required={required}
        {...props}
      />
      {error && (
        <p
          id={errorId}
          className="mt-1 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
};

MobileTextarea.propTypes = {
  label: PropTypes.string.isRequired,
  id: PropTypes.string,
  error: PropTypes.string,
  className: PropTypes.string,
  required: PropTypes.bool,
  rows: PropTypes.number
};

export default React.memo(MobileTextarea);
