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

/**
 * Parse a date string in various formats
 * @param {string} dateString - The date string to parse
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
export const parseResumeDate = (dateString) => {
  if (!dateString) return null;

  // Handle "Present" or "Current" text
  if (dateString.toLowerCase() === 'present' ||
      dateString.toLowerCase() === 'current') {
    return new Date();
  }

  try {
    // Try to parse as is (works for ISO format, YYYY-MM, etc.)
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) return date;

    // Try to parse Month Year format (e.g., "January 2020")
    const monthYearRegex = /^([a-zA-Z]+)\s+(\d{4})$/;
    const match = dateString.match(monthYearRegex);
    if (match) {
      const [, month, year] = match;
      const monthIndex = new Date(`${month} 1, 2000`).getMonth();
      if (!isNaN(monthIndex)) {
        return new Date(parseInt(year), monthIndex);
      }
    }

    // Try to parse MM/YYYY format
    const mmYYYYRegex = /^(\d{1,2})\/(\d{4})$/;
    const mmYYYYMatch = dateString.match(mmYYYYRegex);
    if (mmYYYYMatch) {
      const [, month, year] = mmYYYYMatch;
      return new Date(parseInt(year), parseInt(month) - 1);
    }

    // Try to parse MM/DD/YYYY format
    const mmDDYYYYRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const mmDDYYYYMatch = dateString.match(mmDDYYYYRegex);
    if (mmDDYYYYMatch) {
      const [, month, day, year] = mmDDYYYYMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    return null;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

/**
 * Safely formats a date string for display in the resume
 * @param {string} dateString - The date string to format
 * @param {Object} options - Formatting options for toLocaleDateString
 * @returns {string} - Formatted date string or empty string if invalid
 */
export const formatResumeDate = (dateString, options = { year: 'numeric', month: 'short' }) => {
  try {
    // If no date is provided, return empty string
    if (!dateString) return '';

    // Handle "Present" or "Current" text
    if (dateString.toLowerCase() === 'present' ||
        dateString.toLowerCase() === 'current') {
      return 'Present';
    }

    // Parse the date
    const date = parseResumeDate(dateString);

    // If parsing failed, return the original string
    if (!date) return dateString;

    // Format the date
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    // If there's any error, return the original string
    return dateString;
  }
};

/**
 * Check if a date is in the future
 * @param {string} dateString - The date string to check
 * @returns {boolean} - True if the date is in the future
 */
export const isDateInFuture = (dateString) => {
  if (!dateString) return false;

  // Handle "Present" or "Current" text
  if (dateString.toLowerCase() === 'present' ||
      dateString.toLowerCase() === 'current') {
    return false;
  }

  const date = parseResumeDate(dateString);
  if (!date) return false;

  // Use the actual current date
  const currentDate = new Date();

  return date > currentDate;
};

/**
 * Calculate the duration between two dates in months
 * @param {string} startDateString - The start date string
 * @param {string} endDateString - The end date string
 * @returns {number} - Duration in months
 */
export const calculateDurationInMonths = (startDateString, endDateString) => {
  const startDate = parseResumeDate(startDateString);
  let endDate;

  if (!endDateString ||
      endDateString.toLowerCase() === 'present' ||
      endDateString.toLowerCase() === 'current') {
    // Use the actual current date
    endDate = new Date();
  } else {
    endDate = parseResumeDate(endDateString);
  }

  if (!startDate || !endDate) return 0;

  // Calculate the difference in months
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 +
         (endDate.getMonth() - startDate.getMonth());
};

/**
 * Ensure education dates are consistent with work experience
 * @param {Array} education - Array of education objects
 * @param {Array} workExperience - Array of work experience objects
 * @returns {Array} - Array of education objects with fixed dates
 */
export const ensureEducationWorkConsistency = (education, workExperience) => {
  if (!education || !Array.isArray(education) || education.length === 0) {
    return education;
  }

  if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
    return education;
  }

  // Get the earliest work experience start date
  let earliestWorkStartDate = null;
  for (const job of workExperience) {
    if (job.startDate) {
      const jobStartDate = parseResumeDate(job.startDate);
      if (jobStartDate && (!earliestWorkStartDate || jobStartDate < earliestWorkStartDate)) {
        earliestWorkStartDate = jobStartDate;
      }
    }
  }

  // If we couldn't find a valid work start date, return the original education
  if (!earliestWorkStartDate) {
    return education;
  }

  // Fix education dates to be completed before or around the time of the first job
  const fixedEducation = education.map(edu => {
    try {
      // Get the current date
      const currentDate = new Date();

      // Parse education end date
      let eduEndDate = edu.current ? currentDate : parseResumeDate(edu.endDate);

      // If education end date is after the earliest work start date + 6 months, adjust it
      if (eduEndDate && eduEndDate > earliestWorkStartDate) {
        // Set graduation date to 0-6 months before first job
        const monthsBefore = Math.floor(Math.random() * 6); // 0-6 months before first job
        eduEndDate = new Date(earliestWorkStartDate);
        eduEndDate.setMonth(eduEndDate.getMonth() - monthsBefore);

        // Update the education end date
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        edu.endDate = `${months[eduEndDate.getMonth()]} ${eduEndDate.getFullYear()}`;
        edu.current = false;

        // Also update the start date to be 3-4 years before the end date
        const yearsBeforeGraduation = Math.floor(Math.random() * 2) + 3; // 3-4 years for a degree
        const eduStartDate = new Date(eduEndDate);
        eduStartDate.setFullYear(eduStartDate.getFullYear() - yearsBeforeGraduation);
        edu.startDate = `${months[eduStartDate.getMonth()]} ${eduStartDate.getFullYear()}`;
      }
    } catch (error) {
      console.error('Error fixing education dates:', error);
    }
    return edu;
  });

  return fixedEducation;
};
