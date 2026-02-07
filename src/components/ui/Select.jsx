import React from 'react';
import PropTypes from 'prop-types';
import InfoTooltip from './InfoTooltip';

/**
 * Select - A reusable select component with label, tooltip, and error handling
 *
 * @param {Object} props - Component props
 * @param {string} [props.label] - Select label
 * @param {string} props.id - Select ID (used for label association)
 * @param {Array<{value: string, label: string}>} props.options - Select options
 * @param {string} [props.value] - Selected value
 * @param {Function} [props.onChange] - Change handler
 * @param {string} [props.error] - Error message
 * @param {string} [props.tooltip] - Tooltip content
 * @param {boolean} [props.required=false] - Whether the select is required
 * @param {string} [props.placeholder='Select an option'] - Placeholder text
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} - Select component
 */
const Select = ({
  label,
  id,
  options,
  value,
  onChange,
  error,
  tooltip,
  required = false,
  placeholder = 'Select an option',
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

      <select
        id={id}
        value={value}
        onChange={onChange}
        className={`w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
};

Select.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func,
  error: PropTypes.string,
  tooltip: PropTypes.string,
  required: PropTypes.bool,
  placeholder: PropTypes.string,
  className: PropTypes.string
};

export default React.memo(Select);
