/**
 * Utility functions for handling dates in resumes
 */

/**
 * Get the current date information
 * @returns {Object} Object containing current date information
 */
export const getCurrentDateInfo = () => {
  // Use the actual current date from the system
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
  const currentDay = currentDate.getDate();

  // Format the current date in a human-readable format
  const formattedCurrentDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

  // Get month name
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthName = monthNames[currentDate.getMonth()];

  return {
    date: currentDate,
    year: currentYear,
    month: currentMonth,
    day: currentDay,
    monthName: currentMonthName,
    formatted: formattedCurrentDate,
    iso: currentDate.toISOString()
  };
};

const isCurrentDate = (value) => typeof value === 'string' && /^(present|current)$/i.test(value.trim());

const calendarDate = (year, month = 1, day = 1) => {
  const date = new Date(0);
  // Construct calendar dates in local time: ISO parsing otherwise shifts month-only
  // values into the preceding month for users west of UTC.
  date.setFullYear(Number(year), Number(month) - 1, Number(day));
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === Number(year)
    && date.getMonth() === Number(month) - 1
    && date.getDate() === Number(day) ? date : null;
};

/** Parse supported resume calendar formats without guessing or rolling invalid dates. */
export const parseResumeDate = (dateString) => {
  if (typeof dateString !== 'string' || !dateString.trim()) return null;
  const value = dateString.trim();
  if (isCurrentDate(value)) return new Date();

  const iso = value.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (iso) return calendarDate(iso[1], iso[2] || 1, iso[3] || 1);

  const monthYear = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) return calendarDate(monthYear[2], monthYear[1]);

  const monthDayYear = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (monthDayYear) return calendarDate(monthDayYear[3], monthDayYear[1], monthDayYear[2]);

  const namedMonth = value.match(/^([a-z]+)\s+(\d{4})$/i);
  if (namedMonth) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    const name = namedMonth[1].toLowerCase();
    const month = months.findIndex((entry) => entry === name || entry.slice(0, 3) === name);
    return month === -1 ? null : calendarDate(namedMonth[2], month + 1);
  }
  return null;
};

export const formatResumeDate = (dateString, options = { year: 'numeric', month: 'short' }) => {
  if (typeof dateString !== 'string' || !dateString.trim()) return '';
  const value = dateString.trim();
  if (isCurrentDate(value)) return 'Present';
  // A supplied year alone must not imply an invented January date.
  if (/^\d{4}$/.test(value)) return value;
  const date = parseResumeDate(value);
  return date ? date.toLocaleDateString('en-US', options) : value;
};

export const isDateInFuture = (dateString) => {
  if (isCurrentDate(dateString)) return false;
  const date = parseResumeDate(dateString);
  return date ? date > new Date() : false;
};

export const calculateDurationInMonths = (startDateString, endDateString) => {
  const startDate = parseResumeDate(startDateString);
  const endDate = !endDateString || isCurrentDate(endDateString) ? new Date() : parseResumeDate(endDateString);
  if (!startDate || !endDate) return 0;
  return Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12
    + endDate.getMonth() - startDate.getMonth());
};

/**
 * Retained for callers that normalize generated resume sections. Working while
 * studying is valid; source dates and enrollment status must never be fabricated.
 */
export const ensureEducationWorkConsistency = (education) => (
  Array.isArray(education) ? education.map((entry) => ({ ...entry })) : education
);
