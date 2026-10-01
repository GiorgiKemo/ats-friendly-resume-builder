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
 * @param {React.ReactNode} [props.hint] - Help text shown below the field
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
  hint,
  required = false,
  rows = 4,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const hintId = tooltip ? `${textareaId}-hint` : undefined;
  const helpId = hint ? `${textareaId}-help` : undefined;
  const describedBy = [props['aria-describedby'], helpId, hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex min-h-5 items-center gap-1.5 mb-1.5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
          <label htmlFor={textareaId}>
            {label}
            {required && <span className="text-red-700 dark:text-red-400 ml-1" aria-hidden="true">*</span>}
          </label>
          {tooltip && <InfoTooltip content={tooltip} position="inline" />}
        </div>
      )}
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}

      <textarea
        id={textareaId}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        className="field-control resize-y leading-relaxed"
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

Textarea.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  error: PropTypes.string,
  tooltip: PropTypes.string,
  hint: PropTypes.node,
  required: PropTypes.bool,
  rows: PropTypes.number,
  className: PropTypes.string
};

export default React.memo(Textarea);
