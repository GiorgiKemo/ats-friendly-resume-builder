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
 * @param {React.ReactNode} [props.hint] - Help text shown below the field
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
  hint,
  required = false,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = tooltip ? `${inputId}-hint` : undefined;
  const helpId = hint ? `${inputId}-help` : undefined;
  const describedBy = [props['aria-describedby'], helpId, hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex min-h-5 items-center gap-1.5 mb-1.5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
          <label htmlFor={inputId}>
            {label}
            {required && <span className="text-red-700 dark:text-red-400 ml-1" aria-hidden="true">*</span>}
          </label>
          {tooltip && <InfoTooltip content={tooltip} position="inline" />}
        </div>
      )}
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}

      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="field-control"
        required={required}
        {...props}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={describedBy}
      />

      {hint && !error && (
        <p id={helpId} className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
      )}

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
  hint: PropTypes.node,
  required: PropTypes.bool,
  className: PropTypes.string
};

export default React.memo(Input);
