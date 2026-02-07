import React, { useState, useEffect, useRef } from 'react';
import { countries } from '../../utils/countryData';
import { safeSetTimeout } from '../../utils/security';

const PhoneInputWithCountry = ({
  value = '',
  onChange,
  placeholder = 'Phone number',
  className = '',
  required = false,
  label = 'Phone Number',
  id = 'phone',
  name = 'phone',
  tooltip = 'Include country code',
  error = null,
  ...props
}) => {
  // Parse initial value to extract country code and phone number
  const [selectedCountry, setSelectedCountry] = useState(countries.find(c => c.code === 'US') || countries[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCountries, setFilteredCountries] = useState(countries);
  const dropdownRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
        setFilteredCountries(countries);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Parse initial value
  useEffect(() => {
    if (value) {
      // Try to extract country code from the value
      for (const country of countries) {
        if (value.startsWith(country.dialCode)) {
          setSelectedCountry(country);
          setPhoneNumber(value.substring(country.dialCode.length).trim());
          return;
        }
      }
      // If no country code found, just set the phone number
      setPhoneNumber(value);
    } else {
      setPhoneNumber('');
    }
  }, [value]);

  // Filter countries based on search term
  useEffect(() => {
    if (searchTerm) {
      const filtered = countries.filter(
        country =>
          country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          country.dialCode.includes(searchTerm) ||
          country.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCountries(filtered);
    } else {
      setFilteredCountries(countries);
    }
  }, [searchTerm]);

  // Handle keyboard search with improved accessibility
  const handleKeyDown = (e) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Handle Escape key to close dropdown
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setSearchTerm('');
      return;
    }

    // Handle arrow keys for navigation
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();

      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        return;
      }

      const currentIndex = filteredCountries.findIndex(c => c.code === selectedCountry.code);
      let newIndex;

      if (e.key === 'ArrowDown') {
        newIndex = currentIndex < filteredCountries.length - 1 ? currentIndex + 1 : 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : filteredCountries.length - 1;
      }

      const newCountry = filteredCountries[newIndex];
      if (newCountry) {
        setSelectedCountry(newCountry);

        // Notify parent component of the change
        const newValue = `${newCountry.dialCode} ${phoneNumber}`.trim();
        if (typeof onChange === 'function') {
          onChange({ target: { name, value: newValue } });
        }
      }
      return;
    }

    // Handle Enter key to select current country
    if (e.key === 'Enter' && isDropdownOpen) {
      e.preventDefault();
      setIsDropdownOpen(false);
      return;
    }

    // If key is a letter or number, add it to the search term
    if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
      const newSearchTerm = searchTerm + e.key;
      setSearchTerm(newSearchTerm);

      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
      }

      // Find first matching country and select it
      const matchingCountry = countries.find(
        country =>
          country.name.toLowerCase().startsWith(newSearchTerm.toLowerCase()) ||
          country.dialCode.includes(newSearchTerm) ||
          country.code.toLowerCase().startsWith(newSearchTerm.toLowerCase())
      );

      if (matchingCountry) {
        setSelectedCountry(matchingCountry);

        // Notify parent component of the change
        const newValue = `${matchingCountry.dialCode} ${phoneNumber}`.trim();
        if (typeof onChange === 'function') {
          onChange({ target: { name, value: newValue } });
        }
      }

      // Reset search term after 1.5 seconds of inactivity
      searchTimeoutRef.current = safeSetTimeout(() => {
        setSearchTerm('');
      }, 1500);
    }
  };

  // Handle country selection
  const handleCountrySelect = (country) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);
    setSearchTerm('');
    setFilteredCountries(countries);

    // Notify parent component of the change
    const newValue = `${country.dialCode} ${phoneNumber}`.trim();
    if (typeof onChange === 'function') {
      onChange({ target: { name, value: newValue } });
    }
  };

  // Handle phone number input
  const handlePhoneNumberChange = (e) => {
    const newPhoneNumber = e.target.value;
    setPhoneNumber(newPhoneNumber);

    // Notify parent component of the change
    const newValue = `${selectedCountry.dialCode} ${newPhoneNumber}`.trim();
    if (typeof onChange === 'function') {
      onChange({ target: { name, value: newValue } });
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}

          {tooltip && (
            <div className="relative inline-block ml-1 group">
              <span className="cursor-help text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 16v-4M12 8h.01"></path>
                </svg>
              </span>
              <div className="invisible group-hover:visible absolute z-10 w-48 bg-gray-800 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bottom-full left-1/2 transform -translate-x-1/2 mb-1">
                {tooltip}
              </div>
            </div>
          )}
        </label>
      )}

      <div className="flex w-full">
        {/* Country selector */}
        <div className="relative flex-shrink-0" ref={dropdownRef} style={{ minWidth: '70px', maxWidth: '100px', width: 'auto' }}>
          <button
            type="button"
            className={`flex items-center justify-between border border-gray-300 rounded-l-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-full w-full ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
            style={{ height: '42px' }}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onKeyDown={handleKeyDown}
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-label={`Select country code, currently ${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            <span className="mr-2">{selectedCountry.dialCode}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {isDropdownOpen && (
            <div
              className="absolute z-10 mt-1 w-64 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto"
              role="listbox"
              aria-labelledby={`${id}-label`}
            >
              <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search countries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Search countries"
                />
              </div>
              <ul>
                {filteredCountries.map((country) => (
                  <li
                    key={country.code}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center ${selectedCountry.code === country.code ? 'bg-blue-50 text-blue-600' : ''
                      }`}
                    onClick={() => handleCountrySelect(country)}
                    role="option"
                    aria-selected={selectedCountry.code === country.code}
                    id={`country-option-${country.code}`}
                  >
                    <span className="mr-2">{country.dialCode}</span>
                    <span>{country.name}</span>
                  </li>
                ))}
                {filteredCountries.length === 0 && (
                  <li className="px-3 py-2 text-gray-500" role="alert">No countries found</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Phone number input */}
        <input
          id={id}
          name={name}
          type="tel"
          className={`flex-1 border-t border-b border-r border-gray-300 rounded-r-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-full ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
          style={{ height: '42px', minWidth: 0 }}
          placeholder={placeholder}
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
          required={required}
          {...props}
        />
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default PhoneInputWithCountry;
