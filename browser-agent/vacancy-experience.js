// One source for the app and classic extension content scripts. No DOM or network dependencies.
(() => {
  const unknown = () => ({ years: null, requirementText: '' });
  const cleanLine = (value) => value
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .replace(/^(?:[>*#\u2022]\s*|-\s+)+/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[|:,-]+$/, '')
    .trim();

  // This is a conservative English requirement extractor, not a qualification check.
  // Separate scoped constraints are not interchangeable, even when their numbers agree.
  const extractExperienceRequirement = (text) => {
    if (typeof text !== 'string') return unknown();
    const evidence = new Map();
    let optionalSection = false;
    let backgroundSection = false;
    for (const rawLine of text.split('\n')) {
      const line = cleanLine(rawLine);
      if (/^(?:about (?:us|our company|our team|the company)|company (?:background|history)|our (?:story|history)|who we are)\b/i.test(line)) {
        backgroundSection = true;
      } else if (/^(?:preferred(?: qualifications| requirements| experience)?|nice[ -]to[ -]have|bonus|desirable|optional)\s*:?/i.test(line)) {
        optionalSection = true;
        backgroundSection = false;
      } else if (/^(?:requirements|required(?: qualifications| experience)?|minimum(?: qualifications| requirements)?|qualifications|essential)\s*:?/i.test(line)) {
        optionalSection = false;
        backgroundSection = false;
      }

      for (const rawClause of line.split(/;|\.(?=\s+[A-Z])|(?:,\s*|\s+(?:and|but)\s+)(?=(?:but\s+)?(?:prefer|ideally|require|minimum|\d))/i)) {
        const clause = rawClause.trim();
        if (/\b(?:prefer(?:red|ably)?|nice[ -]to[ -]have|bonus|desirable|ideally|optional|a plus|not required)\b/i.test(clause)) continue;
        if (optionalSection && !/\b(?:required|minimum|must)\b/i.test(clause)) continue;
        if (backgroundSection && !/\b(?:you|your|candidates?|applicants?)\b/i.test(clause)) continue;
        // A leading "With ... experience" introduction has no candidate subject
        // unless the following clause explicitly addresses one; do not infer an employer name.
        if (/^with\b/i.test(clause) && !/,\s*(?:you|(?:the\s+)?(?:candidate|applicant))\b/i.test(clause)) continue;
        if (/\b(?:has|have|combined|collective|our team|our company|we bring|we offer)\b/i.test(clause)
          && !/\b(?:you|candidate|applicant|must|required|minimum)\b/i.test(clause)) continue;

        const scope = clause.toLowerCase().replace(/[.!]+$/, '').trim();
        if (/\bno\s+(?:prior\s+|previous\s+|professional\s+)?experience\s+(?:is\s+)?(?:required|necessary|needed)\b/i.test(clause)) {
          evidence.set(scope, { years: 0, requirementText: 'No experience required' });
          continue;
        }

        const amount = '(?<![\\w.+\\-])(\\d{1,2}(?:\\.\\d+)?)(?:\\s*(?:-|–|—|to)\\s*(\\d{1,2}(?:\\.\\d+)?))?\\s*(\\+|plus)?\\s*(years?|yrs?)';
        const patterns = [
          new RegExp(`${amount}\\s+(?:of\\s+)?(?:[\\w+.#/-]+\\s+){0,4}?experience\\b`, 'gi'),
          new RegExp(`\\bexperience\\s+(?:of\\s+)?${amount}\\b`, 'gi'),
        ];
        for (const match of patterns.flatMap((pattern) => [...clause.matchAll(pattern)])) {
          if (/\bour\s*$/i.test(clause.slice(0, match.index))) continue;
          const key = `${scope}:${match.index}:${match[0].toLowerCase()}`;
          const lower = Number(match[1]);
          const upper = match[2] ? Number(match[2]) : null;
          if (upper !== null && upper < lower) {
            evidence.set(key, unknown());
            continue;
          }
          const qualifier = clause.slice(0, match.index).match(/\b(at least|minimum(?: of)?|at most|up to|maximum(?: of)?|more than|over|less than|under)\s*$/i)?.[1] || '';
          const prefix = qualifier ? `${qualifier[0].toUpperCase()}${qualifier.slice(1).toLowerCase()} ` : '';
          const isMinimum = !/^(?:at most|up to|maximum(?: of)?|more than|over|less than|under)$/i.test(qualifier);
          evidence.set(key, {
            years: isMinimum ? lower : null,
            requirementText: `${prefix}${lower}${upper !== null ? `–${upper}` : match[3] ? '+' : ''} ${lower === 1 && upper === null ? 'year' : 'years'}`,
          });
        }
      }
    }
    if (evidence.size !== 1) return unknown();
    return [...evidence.values()][0];
  };

  // Configurable permits local app HMR; the API itself is immutable and not enumerable.
  Object.defineProperty(globalThis, 'ResumeATSVacancyExperience', {
    value: Object.freeze({ extractExperienceRequirement }),
    configurable: true,
    enumerable: false,
  });
})();
