import React from 'react';
import PropTypes from 'prop-types';

/**
 * MobileFormField - A mobile-optimized form field with larger touch targets
 * Follows WCAG touch target size recommendations (at least 44x44px)
 *
 * @param {Object} props - Component props
 * @param {string} props.label - Field label
 * @param {string} [props.id] - Input ID (used for label association)
 * @param {string} [props.type='text'] - Input type
 * @param {string} [props.error] - Error message
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.required=false] - Whether the field is required
 * @returns {JSX.Element} - MobileFormField component
 */
const MobileFormField = ({
  label,
  id,
  type = 'text',
  error,
  className = '',
  required = false,
  ...props
}) => {
  // Generate a unique ID if none is provided
  const inputId = id || `mobile-field-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={`mb-4 ${className}`}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id={inputId}
        type={type}
        className={`w-full px-4 py-3 text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
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

MobileFormField.propTypes = {
  label: PropTypes.string.isRequired,
  id: PropTypes.string,
  type: PropTypes.string,
  error: PropTypes.string,
  className: PropTypes.string,
  required: PropTypes.bool
};

export default React.memo(MobileFormField);
