import React, { useId } from 'react';
import PropTypes from 'prop-types';
import InfoTooltip from './InfoTooltip';

/**
 * Input - A reusable input component with label, tooltip, and error handling
 *
 * @param {Object} props - Component props
 * @param {string} [props.label] - Input label
 * @param {string} props.id - Input ID (used for label association)
 * @param {string} [props.type='text'] - Input type
 * @param {string} [props.placeholder] - Input placeholder
 * @param {string} [props.value] - Input value
 * @param {Function} [props.onChange] - Change handler
 * @param {string} [props.error] - Error message
 * @param {string} [props.tooltip] - Tooltip content
 * @param {boolean} [props.required=false] - Whether the input is required
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} - Input component
 */
const Input = ({
  label,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  tooltip,
  required = false,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = tooltip ? `${inputId}-hint` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex items-center mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">
          <label htmlFor={inputId}>
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </label>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
      )}
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}

      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full min-h-[48px] text-base border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
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

Input.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string,
  type: PropTypes.string,
  placeholder: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  error: PropTypes.string,
  tooltip: PropTypes.string,
  required: PropTypes.bool,
  className: PropTypes.string
};

export default React.memo(Input);
