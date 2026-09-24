export const ANALYTICS_REPORTING_TIME_ZONE = 'Asia/Tbilisi';

const SUPPORTED_TIME_ZONES = new Set(['Asia/Tbilisi', 'UTC']);
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATTERS = new Map();

const getFormatter = (timeZone, includeTime = false) => {
  if (!SUPPORTED_TIME_ZONES.has(timeZone)) throw new Error('Unsupported analytics reporting timezone');
  const key = `${timeZone}:${includeTime}`;
  if (!FORMATTERS.has(key)) {
    FORMATTERS.set(key, new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } : {}),
    }));
  }
  return FORMATTERS.get(key);
};

const readDateParts = (value) => {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) throw new Error('Enter a valid analytics date');
  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error('Enter a valid analytics date');
  }
  return { year, month, day };
};

const partsFor = (formatter, date) => Object.fromEntries(
  formatter.formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]),
);

export const formatDateInputValueInTimeZone = (date, timeZone = ANALYTICS_REPORTING_TIME_ZONE) => {
  if (!date || typeof date.getTime !== 'function' || Number.isNaN(date.getTime())) throw new Error('A valid date is required');
  const { year, month, day } = partsFor(getFormatter(timeZone), date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const formatAnalyticsTimestamp = (value, timeZone = ANALYTICS_REPORTING_TIME_ZONE) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid analytics timestamp is required');
  const { year, month, day, hour, minute } = partsFor(getFormatter(timeZone, true), date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const shiftDateInputValue = (value, dayCount) => {
  const { year, month, day } = readDateParts(value);
  if (!Number.isInteger(dayCount)) throw new Error('Date shift must be a whole number of days');
  const shifted = new Date(Date.UTC(year, month - 1, day + dayCount));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
};

const midnightInTimeZone = (value, timeZone) => {
  const { year, month, day } = readDateParts(value);
  const targetWallClock = Date.UTC(year, month - 1, day);
  const formatter = getFormatter(timeZone, true);
  let candidate = targetWallClock;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = partsFor(formatter, new Date(candidate));
    const representedWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const next = targetWallClock - (representedWallClock - candidate);
    if (next === candidate) break;
    candidate = next;
  }

  const resolved = partsFor(formatter, new Date(candidate));
  if (resolved.year !== year || resolved.month !== month || resolved.day !== day
    || resolved.hour !== 0 || resolved.minute !== 0 || resolved.second !== 0) {
    throw new Error('Analytics date boundary does not exist in the reporting timezone');
  }
  return new Date(candidate).toISOString();
};

export const getAnalyticsDateRange = (fromDate, toDate, timeZone = ANALYTICS_REPORTING_TIME_ZONE) => {
  if (!SUPPORTED_TIME_ZONES.has(timeZone)) throw new Error('Unsupported analytics reporting timezone');
  const fromParts = readDateParts(fromDate);
  const toParts = readDateParts(toDate);
  const fromDay = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toDay = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  if (fromDay > toDay) throw new Error('Analytics start date must not follow its end date');

  return {
    from: midnightInTimeZone(fromDate, timeZone),
    to: midnightInTimeZone(shiftDateInputValue(toDate, 1), timeZone),
    timeZone,
  };
};
