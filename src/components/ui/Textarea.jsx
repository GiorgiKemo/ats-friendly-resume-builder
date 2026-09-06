import React, { useId } from 'react';
import PropTypes from 'prop-types';
import InfoTooltip from './InfoTooltip';

/**
 * Textarea - A reusable textarea component with label, tooltip, and error handling
 *
 * @param {Object} props - Component props
 * @param {string} [props.label] - Textarea label
 * @param {string} props.id - Textarea ID (used for label association)
 * @param {string} [props.placeholder] - Textarea placeholder
 * @param {string} [props.value] - Textarea value
 * @param {Function} [props.onChange] - Change handler
 * @param {string} [props.error] - Error message
 * @param {string} [props.tooltip] - Tooltip content
 * @param {boolean} [props.required=false] - Whether the textarea is required
 * @param {number} [props.rows=4] - Number of rows
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} - Textarea component
 */
const Textarea = ({
  label,
  id,
  placeholder,
  value,
  onChange,
  error,
  tooltip,
  required = false,
  rows = 4,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const hintId = tooltip ? `${textareaId}-hint` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex items-center mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">
          <label htmlFor={textareaId}>
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </label>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
      )}
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}

      <textarea
        id={textareaId}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        className={`w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        required={required}
        {...props}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={describedBy}
      />

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}
    </div>
  );
};

Textarea.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  error: PropTypes.string,
  tooltip: PropTypes.string,
  required: PropTypes.bool,
  rows: PropTypes.number,
  className: PropTypes.string
};

export default React.memo(Textarea);
