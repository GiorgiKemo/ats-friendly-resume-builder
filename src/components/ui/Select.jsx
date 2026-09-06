import React, { useId } from 'react';
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
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const hintId = tooltip ? `${selectId}-hint` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex items-center mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">
          <label htmlFor={selectId}>
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </label>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
      )}
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}

      <select
        id={selectId}
        value={value}
        onChange={onChange}
        className={`select-field ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        required={required}
        {...props}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={describedBy}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}
    </div>
  );
};

Select.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string,
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
