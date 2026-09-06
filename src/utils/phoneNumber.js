import { countries } from './countryData.js';

export function splitPhoneNumber(value = '', preferredCode = 'US') {
  const preferred = countries.find((country) => country.code === preferredCode) || countries[0];
  const text = value.trim();
  const matches = countries.filter((country) => text.startsWith(country.dialCode))
    .sort((a, b) => b.dialCode.length - a.dialCode.length);
  if (!matches.length) return { country: preferred, number: text };
  const longestCode = matches[0].dialCode;
  const country = matches.find((candidate) => candidate.dialCode === longestCode && candidate.code === preferredCode) || matches[0];
  return { country, number: text.slice(country.dialCode.length).trim() };
}

export function joinPhoneNumber(dialCode, number = '') {
  if (!number.trim()) return '';
  return number.trim().startsWith('+') ? number.trim() : `${dialCode} ${number.trim()}`;
}
