import React, { useId, useState } from 'react';
import { countries } from '../../utils/countryData';
import { joinPhoneNumber, splitPhoneNumber } from '../../utils/phoneNumber';
import InfoTooltip from './InfoTooltip';

const PhoneInputWithCountry = ({
  value = '', onChange, placeholder = 'Phone number', className = '', required = false,
  label = 'Phone Number', id, name = 'phone', tooltip = 'Include country code', error = null, ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [preferredCountry, setPreferredCountry] = useState('US');
  const { country, number } = splitPhoneNumber(value, preferredCountry);
  const hintId = tooltip ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const emitChange = (nextValue) => onChange?.({ target: { name, value: nextValue } });

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex items-center mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">
        <label htmlFor={inputId}>{label}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}</label>
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}
      <div className="flex w-full">
        <select
          aria-label={`${label} country code`}
          value={country.code}
          disabled={props.disabled}
          className="min-h-[48px] w-28 shrink-0 rounded-l border border-gray-300 bg-gray-50 px-2 text-base text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          onChange={(event) => {
            const selected = countries.find((item) => item.code === event.target.value);
            setPreferredCountry(selected.code);
            emitChange(joinPhoneNumber(selected.dialCode, number));
          }}
        >
          {countries.map((item) => <option key={item.code} value={item.code}>{item.dialCode} {item.name}</option>)}
        </select>
        <input
          id={inputId}
          name={name}
          type="tel"
          autoComplete="tel-national"
          className={`min-h-[48px] min-w-0 flex-1 rounded-r border border-l-0 bg-white px-3 py-2 text-base text-gray-900 focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100 ${error ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`}
          placeholder={placeholder}
          value={number}
          onChange={(event) => emitChange(joinPhoneNumber(country.dialCode, event.target.value))}
          required={required}
          {...props}
          aria-invalid={error ? 'true' : props['aria-invalid']}
          aria-describedby={[props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined}
        />
      </div>
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default PhoneInputWithCountry;
