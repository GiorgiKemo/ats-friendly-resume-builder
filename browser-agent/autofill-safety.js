(() => {
  const cleanText = (value = '') => `${value ?? ''}`
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalize = (value = '') => cleanText(value).toLowerCase();

  const SENSITIVE_FIELD_RULES = [
    {
      id: 'work_authorization',
      label: 'work authorization',
      pattern: /work authorization|authorized to work|legally authorized|eligible to work|right to work/,
      explicitAnswerKeys: ['workAuthorization', 'authorizedToWork', 'rightToWork', 'eligibleToWork'],
    },
    {
      id: 'sponsorship',
      label: 'visa or sponsorship',
      pattern: /sponsor|sponsorship|visa|h[- ]?1b|work permit|immigration.*support|require.*support/,
      explicitAnswerKeys: ['requiresSponsorship', 'visaSponsorship', 'needsSponsorship', 'requiresVisaSponsorship'],
    },
    {
      id: 'compensation',
      label: 'compensation',
      pattern: /salary|compensation|expected pay|pay expectation|current ctc|expectedctc|annualsalary|pay range/,
      explicitAnswerKeys: ['salaryExpectation', 'expectedSalary', 'currentSalary', 'salaryCurrent', 'salaryCurrency'],
    },
    {
      id: 'gender',
      label: 'gender',
      pattern: /\bgender\b|\bsex\b/,
      explicitAnswerKeys: ['gender', 'sex'],
    },
    {
      id: 'pronouns',
      label: 'pronouns',
      pattern: /pronoun/,
      explicitAnswerKeys: ['pronouns'],
    },
    {
      id: 'race_ethnicity',
      label: 'race or ethnicity',
      pattern: /race|ethnicity/,
      explicitAnswerKeys: ['raceEthnicity', 'race', 'ethnicity'],
    },
    {
      id: 'hispanic_latino',
      label: 'Hispanic or Latino',
      pattern: /hispanic|latino|latina|latinx/,
      explicitAnswerKeys: ['hispanicLatino'],
    },
    {
      id: 'veteran_status',
      label: 'veteran status',
      pattern: /veteran/,
      explicitAnswerKeys: ['veteranStatus'],
    },
    {
      id: 'disability_status',
      label: 'disability status',
      pattern: /disability|disabled/,
      explicitAnswerKeys: ['disabilityStatus'],
    },
    {
      id: 'legal_age',
      label: 'age confirmation',
      pattern: /18 years|age or older|over 18|at least 18/,
      explicitAnswerKeys: ['isAdult', 'ageOver18'],
    },
    {
      id: 'background_check',
      label: 'background check',
      pattern: /background.*check|criminal record|conviction/,
      explicitAnswerKeys: ['backgroundCheckConsent', 'backgroundCheck', 'criminalRecord'],
    },
    {
      id: 'privacy_consent',
      label: 'privacy or consent',
      pattern: /privacy|data retention|data processing|recruiting.*consent|consent to|agree to/,
      explicitAnswerKeys: ['privacyConsent', 'dataProcessingConsent', 'recruitingConsent'],
    },
  ];

  const DEFAULT_OR_UNSAFE_VALUES = /^(yes|no|true|false|prefer not|prefer not to answer|decline|do not wish|not disclose|rather not|n\/?a|na)$/i;

  const hasExplicitAnswer = (profile = {}, keys = []) => {
    const answers = profile?.answers && typeof profile.answers === 'object' ? profile.answers : {};
    return keys.some((key) => cleanText(answers[key]) !== '');
  };

  const getSensitiveRule = (meta = '') => (
    SENSITIVE_FIELD_RULES.find((rule) => rule.pattern.test(meta)) || null
  );

  const evaluate = ({
    meta = '',
    value = '',
    profile = {},
    source = 'profile',
    required = false,
    alreadyFilled = false,
  } = {}) => {
    const normalizedMeta = normalize(meta);
    const normalizedValue = cleanText(value);
    const rule = getSensitiveRule(normalizedMeta);
    const explicitAnswer = rule ? hasExplicitAnswer(profile, rule.explicitAnswerKeys) : true;
    const sourceText = normalize(source);
    const sourceIsExplicit = /explicit|profile|candidate|resumeats/.test(sourceText) && explicitAnswer;
    let score = normalizedMeta.length >= 18 ? 78 : 58;
    const reasons = [];

    if (!normalizedValue) {
      return {
        score: 0,
        shouldFill: false,
        sensitive: Boolean(rule),
        reason: 'No answer was available for this field.',
      };
    }

    if (required) score += 4;
    if (alreadyFilled) score -= 16;

    if (rule) {
      score -= 10;
      if (!explicitAnswer) {
        score -= 38;
        reasons.push(`missing explicit ${rule.label} answer`);
      } else if (sourceIsExplicit) {
        score += 8;
      }
      if (DEFAULT_OR_UNSAFE_VALUES.test(normalizedValue) && !sourceIsExplicit) {
        score -= 18;
        reasons.push('default answer requires review');
      }
    }

    const shouldFill = score >= 72;

    return {
      score,
      shouldFill,
      sensitive: Boolean(rule),
      sensitiveType: rule?.id || '',
      reason: shouldFill
        ? ''
        : reasons.join(', ') || 'low-confidence field mapping',
    };
  };

  globalThis.ResumeATSAutofillSafety = {
    evaluate,
    canAutomaticallySubmit: ({ needsReview, accessibleFieldCount, reviewFieldCount, sensitiveFieldCount, profileMissingFields, crossOriginFrameCount } = {}) => (
      Number.isFinite(accessibleFieldCount) && accessibleFieldCount > 0
      && [reviewFieldCount, sensitiveFieldCount, crossOriginFrameCount].every((count) => Number.isFinite(count) && count === 0)
      && needsReview === false
      && !(Array.isArray(profileMissingFields) && profileMissingFields.length > 0)
    ),
    isSensitiveField: (meta = '') => Boolean(getSensitiveRule(normalize(meta))),
    sensitiveRules: SENSITIVE_FIELD_RULES.map(({ id, label }) => ({ id, label })),
    maxReviewFields: 8,
  };
})();
