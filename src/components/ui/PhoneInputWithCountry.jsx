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
      <div className="flex min-h-5 items-center gap-1.5 mb-1.5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
        <label htmlFor={inputId}>{label}{required && <span className="ml-1 text-red-700 dark:text-red-400" aria-hidden="true">*</span>}</label>
        {tooltip && <InfoTooltip content={tooltip} position="inline" />}
      </div>
      {tooltip && <span id={hintId} className="sr-only">{tooltip}</span>}
      {/* One bordered control: a compact country chip (the native select is
          stretched invisibly over it, so the list still shows full country
          names and supports type-ahead) followed by the number field. */}
      <div
        className={`field-control flex items-stretch !p-0 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 dark:focus-within:border-blue-400 ${error ? '!border-red-500' : ''}`}
      >
        <div className="relative flex shrink-0 items-center gap-1.5 rounded-l-lg border-r border-slate-200 pl-3.5 pr-2.5 text-base text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/40">
          <span className="text-xs font-semibold tracking-wide text-slate-400 dark:text-slate-500" aria-hidden="true">{country.code}</span>
          <span aria-hidden="true">{country.dialCode}</span>
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
          <select
            aria-label={`${label} country code`}
            value={country.code}
            disabled={props.disabled}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const selected = countries.find((item) => item.code === event.target.value);
              setPreferredCountry(selected.code);
              emitChange(joinPhoneNumber(selected.dialCode, number));
            }}
          >
            {countries.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.dialCode})</option>)}
          </select>
        </div>
        <input
          id={inputId}
          name={name}
          type="tel"
          autoComplete="tel-national"
          className="min-w-0 flex-1 rounded-r-lg border-0 bg-transparent px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
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
