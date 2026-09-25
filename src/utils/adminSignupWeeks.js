const WEEK_COUNT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const startOfUtcWeek = (date) => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - (day === 0 ? 6 : day - 1));
  return copy;
};

const weekLabel = (start) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(start);

export const buildSignupWeeks = (createdAts = [], now = new Date()) => {
  const current = startOfUtcWeek(now);
  const first = new Date(current.getTime() - (WEEK_COUNT - 1) * WEEK_MS);
  const counts = Array.from({ length: WEEK_COUNT }, () => 0);

  createdAts.forEach((value) => {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return;
    const index = Math.floor((time - first.getTime()) / WEEK_MS);
    if (index >= 0 && index < WEEK_COUNT) counts[index] += 1;
  });

  return counts.map((count, index) => {
    const start = new Date(first.getTime() + index * WEEK_MS);
    return { label: weekLabel(start), start: start.toISOString(), count };
  });
};

const isSignupWeek = (week) => (
  week
  && typeof week.label === 'string'
  && week.label.length > 0
  && Number.isFinite(Number(week.count))
  && Number(week.count) >= 0
);

export const resolveSignupWeeks = ({ signupWeeks, createdAts, complete, now = new Date() }) => {
  if (Array.isArray(signupWeeks) && signupWeeks.length === WEEK_COUNT && signupWeeks.every(isSignupWeek)) {
    return signupWeeks.map((week) => ({
      label: week.label,
      start: typeof week.start === 'string' ? week.start : '',
      count: Number(week.count),
    }));
  }
  if (!complete) return null;
  return buildSignupWeeks(createdAts, now);
};
