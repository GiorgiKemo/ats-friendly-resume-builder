import React from 'react';
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
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
          {tooltip && <InfoTooltip content={tooltip} />}
        </label>
      )}

      <textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        className={`w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />

      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
};

Textarea.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string.isRequired,
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
