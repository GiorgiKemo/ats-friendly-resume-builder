import React, { useId } from 'react';
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
  const generatedId = useId();
  const textareaId = id || generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy = [props['aria-describedby'], errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`mb-4 ${className}`}>
      <label
        htmlFor={textareaId}
        className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
      >
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>
      <textarea
        id={textareaId}
        className={`w-full px-4 py-3 text-base border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'
        }`}
        rows={rows}
        required={required}
        {...props}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={describedBy}
      />
      {error && (
        <p
          id={errorId}
          className="mt-1 text-sm text-red-600 dark:text-red-400"
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
