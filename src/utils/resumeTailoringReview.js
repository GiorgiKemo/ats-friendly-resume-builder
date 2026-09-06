import { assertCommittedResume } from '../../supabase/functions/_shared/resume/committedResume.js';
import { resumeQuantityTokens } from './resumeQuantities.js';
export { assertCommittedResume };
const clone = (value) => JSON.parse(JSON.stringify(value));
let reviewSequence = 0;
const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value) => typeof value === 'string' ? value : Array.isArray(value) ? value.filter((item) => typeof item === 'string').join('\n') : '';
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, clone(value[key])]));

const personalFields = ['fullName', 'email', 'phone', 'location', 'jobTitle', 'summary', 'linkedin', 'github', 'website', 'portfolio', 'other', 'professionalLinks'];
const collectionFields = {
  workExperience: ['id', 'title', 'jobTitle', 'company', 'location', 'startDate', 'endDate', 'current', 'description', 'responsibilities', 'achievements'],
  education: ['id', 'institution', 'school', 'degree', 'fieldOfStudy', 'field', 'location', 'startDate', 'endDate', 'current', 'description', 'gpa'],
  projects: ['id', 'title', 'name', 'role', 'description', 'details', 'technologies', 'startDate', 'endDate', 'url'],
  certifications: ['id', 'name', 'title', 'issuer', 'date', 'issueDate', 'expirationDate', 'expiryDate', 'noExpiration', 'credentialId', 'credentialID', 'credentialURL', 'url', 'description'],
};

const reviewError = (message) => Object.assign(new Error(message), { code: 'TAILORING_REVIEW_REQUIRED' });

// A wording review is not a truth oracle, but a few claim classes are too
// consequential to let a one-click suggestion silently become resume fact.
// These signals are intentionally conservative and only fire when the risky
// term is absent from the captured source/evidence. The candidate can still
// use the wording after an explicit accuracy confirmation in the review UI.
const CLAIM_RISK_SIGNALS = [
  {
    label: 'seniority or people-management claim',
    pattern: /\b(?:executive|chief|director|vice\s+president|vp|head\s+of|principal|senior|lead(?:er|ing)?|manager|manage(?:d|s|ment|ing)?|supervis(?:e|ed|es|ing)|hir(?:e|ed|es|ing)|recruit(?:ed|s|ing)?|budget|ownership|owner)\b/iu,
  },
  {
    label: 'business-impact or scale claim',
    pattern: /\b(?:revenue|profit|sales|income|margin|funding|valuation|clearance|customers?|accounts?|employees?|users?|millions?|billions?)\b/iu,
  },
  {
    label: 'technology or tool claim',
    pattern: /\b(?:kubernetes|docker|terraform|aws|azure|gcp|react(?:\.js)?|angular|vue(?:\.js)?|node(?:\.js)?|python|java|golang|rust|swift|ruby|rails|django|spring|graphql|postgres(?:ql)?|mongodb|snowflake|databricks|kafka|spark|c\+\+|c#|sql)\b/iu,
  },
  {
    label: 'institution or employer affiliation',
    pattern: /\b(?:nasa|stanford|harvard|mit|oxford|yale|cambridge|princeton|berkeley|google|microsoft|amazon|apple|meta|openai|spacex|tesla)\b/iu,
  },
  {
    label: 'license, credential or security-clearance claim',
    pattern: /\b(?:licen[cs](?:e|ed|ing)?|certif(?:y|ied|ication)|accredit(?:ed|ation)?|security\s+clearance|clearance)\b/iu,
  },
  {
    label: 'proficiency or expertise claim',
    pattern: /(?:\b(?:native|expert|master(?:y|ed)?|fluent|professional[- ]level)\b|ネイティブ|母語)/iu,
  },
];

const NEGATED_ACTIONS = /\b(?:supervis\w*|manag\w*|approv\w*|own\w*|lead\w*|hir\w*|recruit\w*)\b/iu;
const NEGATION = /\b(?:did\s+not|didn't|does\s+not|doesn't|do\s+not|don't|never|no|not)\b/iu;
const QUANTITY_MENTION = /(?<![\p{L}\p{N}])(?:[+-]?\d+(?:[.,]\d+)?(?:\s*(?:%|percent|per\s+cent|years?|months?|weeks?|days?|hours?|minutes?|seconds?|customers?|accounts?|users?|employees?|engineers?|tickets?|requests?|projects?|million|billion|thousand))?)/giu;
const CLAIM_STOP_WORDS = new Set('a an and are by for from in into is it of on or the this to with was were will'.split(' '));

const quantityMentions = (value) => [...`${value || ''}`.normalize('NFKC').matchAll(QUANTITY_MENTION)]
  .map((match) => ({
    raw: match[0],
    token: resumeQuantityTokens(match[0])[0] || '',
    index: match.index || 0,
  }))
  .filter((mention) => mention.token);

const quantityContextWords = (value, index, length) => `${value || ''}`.slice(
  Math.max(0, index - 60), index + length + 60,
).normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
  .split(/\s+/)
  .filter((word) => word.length > 2 && !CLAIM_STOP_WORDS.has(word) && !/^\d+$/.test(word));

const quantityMeaningRisk = (sourceText, candidateText) => {
  const sourceMentions = quantityMentions(sourceText);
  const candidateMentions = quantityMentions(candidateText);
  return candidateMentions.some((candidate) => {
    const peers = sourceMentions.filter((source) => source.token === candidate.token);
    if (peers.length === 0) return true;
    const candidateWords = new Set(quantityContextWords(candidateText, candidate.index, candidate.raw.length));
    const sourceWords = new Set(peers.flatMap((source) => quantityContextWords(sourceText, source.index, source.raw.length)));
    return [...candidateWords].length > 0 && ![...candidateWords].some((word) => sourceWords.has(word));
  });
};

const claimRisk = ({ original, proposed, evidence }) => {
  const sourceText = [original, ...(Array.isArray(evidence) ? evidence.map((entry) => entry?.text || '') : [])]
    .filter(Boolean).join('\n');
  const candidateText = `${proposed || ''}`;
  if (!candidateText.trim() || candidateText.replace(/\s+/g, ' ').trim() === `${original || ''}`.replace(/\s+/g, ' ').trim()) return null;

  const normalizedSource = sourceText.normalize('NFKC').toLocaleLowerCase();
  const reasons = CLAIM_RISK_SIGNALS
    .filter(({ pattern }) => {
      const matches = candidateText.match(new RegExp(pattern.source, `${pattern.flags}g`)) || [];
      return matches.some((match) => !normalizedSource.includes(match.normalize('NFKC').toLocaleLowerCase()));
    })
    .map(({ label }) => label);

  // A source can contain the same action while explicitly denying it. A
  // simple token-presence check would miss that polarity reversal.
  if (NEGATION.test(sourceText) && NEGATED_ACTIONS.test(sourceText) && NEGATED_ACTIONS.test(candidateText)) {
    reasons.push('negation or responsibility reversal');
  }

  if (quantityMeaningRisk(sourceText, candidateText)) reasons.push('number or unit attached to a different claim');

  // All-caps names (for example NASA) are usually organizations or products;
  // keep them source-bound without penalizing ordinary sentence casing.
  const sourceAcronyms = new Set((sourceText.match(/\b[A-Z][A-Z0-9]{2,}\b/g) || []).map((value) => value.toLowerCase()));
  const novelAcronym = (candidateText.match(/\b[A-Z][A-Z0-9]{2,}\b/g) || [])
    .find((value) => !sourceAcronyms.has(value.toLowerCase()));
  if (novelAcronym) reasons.push('new organization or product name');

  return reasons.length > 0 ? {
    level: 'high',
    confirmationRequired: true,
    reasons: [...new Set(reasons)],
  } : null;
};

const targetFor = (id) => {
  if (id === 'summary') return { collection: 'personalInfo', field: 'summary' };
  const match = /^(work|project|certification):(0|[1-9]\d*)$/.exec(id);
  if (!match) return null;
  return { collection: { work: 'workExperience', project: 'projects', certification: 'certifications' }[match[1]], index: Number(match[2]), field: 'description' };
};
const originalFor = (base, target) => text(target.index === undefined ? base.personalInfo?.summary : base[target.collection]?.[target.index]?.description);

export const isResumeTailoringReview = (review) => {
  if (!isRecord(review) || review.kind !== 'resume-tailoring-review' || review.version !== 1
    || typeof review.reviewId !== 'string' || !review.reviewId
    || !isRecord(review.baseResume) || !isRecord(review.baseResume.personalInfo) || !Array.isArray(review.suggestions)) return false;
  const seen = new Set();
  return review.suggestions.every((suggestion) => {
    if (!isRecord(suggestion) || typeof suggestion.id !== 'string' || seen.has(suggestion.id)
      || typeof suggestion.label !== 'string' || typeof suggestion.original !== 'string' || typeof suggestion.proposed !== 'string'
      || !Array.isArray(suggestion.evidence) || !suggestion.evidence.every((entry) => isRecord(entry) && typeof entry.label === 'string' && typeof entry.text === 'string')) return false;
    if (suggestion.risk !== undefined && (!isRecord(suggestion.risk)
      || suggestion.risk.level !== 'high'
      || suggestion.risk.confirmationRequired !== true
      || !Array.isArray(suggestion.risk.reasons)
      || suggestion.risk.reasons.length === 0
      || !suggestion.risk.reasons.every((reason) => typeof reason === 'string' && reason.trim()))) return false;
    const target = targetFor(suggestion.id);
    if (!target || (target.index !== undefined && !isRecord(review.baseResume[target.collection]?.[target.index]))) return false;
    seen.add(suggestion.id);
    return suggestion.original === originalFor(review.baseResume, target);
  });
};

const summaryEvidence = (base) => {
  const evidence = [];
  if (text(base.personalInfo.summary)) evidence.push({ label: 'Original summary', text: text(base.personalInfo.summary) });
  for (const [collection, label] of [['workExperience', 'Work history'], ['education', 'Education'], ['projects', 'Project'], ['certifications', 'Certification']]) {
    for (const item of base[collection]) {
      const identity = [item.jobTitle || item.title || item.name || item.degree, item.company || item.institution || item.issuer,
        item.fieldOfStudy, text(item.technologies),
        item.startDate, item.current ? 'Present' : item.endDate || item.date || item.issueDate].filter(Boolean).join(' · ');
      evidence.push({ label: `${label}${identity ? ` — ${identity}` : ''}`, text: text(item.description) });
    }
  }
  if (base.skills.length) evidence.push({ label: 'Profile skills', text: base.skills.map((skill) => typeof skill === 'string' ? skill : text(skill?.name)).filter(Boolean).join(', ') });
  for (const section of base.additionalSections) evidence.push({ label: text(section.title) || 'Additional source details', text: text(section.content) });
  return evidence;
};

const sameSourceEntry = (collection, source, candidate) => {
  if (!isRecord(candidate)) return false;
  const keys = collection === 'workExperience' ? ['id', 'title', 'jobTitle', 'company', 'startDate', 'endDate', 'current']
    : collection === 'projects' ? ['id', 'title', 'name', 'startDate', 'endDate', 'url'] : ['id', 'name', 'title', 'issuer', 'date', 'issueDate'];
  return keys.every((key) => (source[key] ?? '') === (candidate[key] ?? ''));
};

// Called only with an application-built source baseline and the separately
// guarded/normalized candidate. Provider metadata and approval flags are ignored.
export const createResumeTailoringReview = ({ baseResume, candidateResume, sourceInfo = {}, targetJobTitle = '' }) => {
  if (!isRecord(baseResume) || !isRecord(candidateResume)) throw reviewError('The AI review could not be prepared. Generate the draft again.');
  const base = pick(baseResume, ['selectedTemplate', 'selectedFont', 'fontSize', 'lineHeight', 'sectionSpacing', 'atsQuality', 'keywordAnalysis']);
  base.personalInfo = pick(baseResume.personalInfo || {}, personalFields);
  base.personalInfo.summary = text(base.personalInfo.summary);
  for (const [collection, fields] of Object.entries(collectionFields)) {
    base[collection] = (Array.isArray(baseResume[collection]) ? baseResume[collection] : []).filter(isRecord).map((item) => {
      const record = pick(item, fields);
      record.description = text(record.description || record.responsibilities || record.details);
      if (collection === 'workExperience') record.responsibilities = record.description;
      return record;
    });
  }
  base.skills = Array.isArray(baseResume.skills) ? clone(baseResume.skills) : [];
  base.additionalSections = Array.isArray(baseResume.additionalSections) ? clone(baseResume.additionalSections) : [];
  const suggestions = [];
  const add = (id, label, original, proposed, evidence) => {
    // Whitespace-only differences do not require a prose decision. We retain the
    // original in that case; changed words, punctuation and qualifiers do.
    if (!proposed.trim() || original.replace(/\s+/g, ' ').trim() === proposed.replace(/\s+/g, ' ').trim()) return;
    const risk = claimRisk({ original, proposed, evidence });
    suggestions.push({ id, label, original, proposed, evidence, ...(risk ? { risk } : {}) });
  };
  add('summary', 'Professional summary', base.personalInfo.summary, text(candidateResume.personalInfo?.summary), summaryEvidence(base));
  for (const [collection, prefix, sectionLabel] of [['workExperience', 'work', 'Work history'], ['projects', 'project', 'Project'], ['certifications', 'certification', 'Certification']]) {
    base[collection].forEach((item, index) => {
      if (!sameSourceEntry(collection, item, candidateResume[collection]?.[index])) return;
      const identity = [item.jobTitle || item.title || item.name, item.company || item.issuer].filter(Boolean).join(' · ');
      add(`${prefix}:${index}`, `${sectionLabel}${identity ? ` — ${identity}` : ''}`, item.description,
        text(candidateResume[collection]?.[index]?.description), [{ label: 'Source record', text: [identity, item.startDate, item.current ? 'Present' : item.endDate || item.date || item.issueDate].filter(Boolean).join(' · ') }]);
    });
  }
  const metadata = {};
  for (const key of ['ownerId', 'runId', 'profileId', 'profileRevision', 'resumeId', 'resumeRevision']) {
    if (typeof sourceInfo[key] === 'string' || typeof sourceInfo[key] === 'number') metadata[key] = sourceInfo[key];
  }
  const reviewId = globalThis.crypto?.randomUUID?.() || `review-${Date.now()}-${++reviewSequence}`;
  return freeze({ kind: 'resume-tailoring-review', version: 1, reviewId, baseResume: base, suggestions, sourceInfo: metadata, targetJobTitle: text(targetJobTitle) });
};

// This records a candidate's explicit wording choices, not a factuality verdict.
// Do not run content-changing hardening after this boundary.
export const resolveResumeTailoringReview = (review, decisions = {}) => {
  if (!isResumeTailoringReview(review) || !isRecord(decisions)) throw reviewError('This review is unavailable. Generate the draft again.');
  const ids = new Set(review.suggestions.map((suggestion) => suggestion.id));
  if (Object.keys(decisions).some((id) => !ids.has(id))) throw reviewError('The wording choices belong to a different review.');
  const result = clone(review.baseResume);
  for (const suggestion of review.suggestions) {
    const decision = decisions[suggestion.id];
    if (!isRecord(decision) || decision.reviewId !== review.reviewId || !['original', 'suggested', 'edited'].includes(decision.choice)
      || (decision.choice === 'edited' && typeof decision.text !== 'string')) throw reviewError('Choose original, suggested or edited wording for every change.');
    const requiresConfirmation = suggestion.risk?.confirmationRequired === true;
    const confirmed = decision.confirmRisk === true;
    // Risky proposals remain reviewable, but an unconfirmed choice fails
    // closed to the captured wording. This protects callers that resolve a
    // packet directly instead of going through the UI checkbox.
    const chosen = decision.choice === 'original' || (requiresConfirmation && !confirmed)
      ? suggestion.original : decision.choice === 'suggested' ? suggestion.proposed : decision.text;
    const target = targetFor(suggestion.id);
    if (target.index === undefined) result.personalInfo.summary = chosen;
    else {
      result[target.collection][target.index].description = chosen;
      if (target.collection === 'workExperience') result.workExperience[target.index].responsibilities = chosen;
      const alias = target.collection === 'workExperience' ? 'achievements' : target.collection === 'projects' ? 'details' : null;
      if (alias && Object.hasOwn(result[target.collection][target.index], alias)) result[target.collection][target.index][alias] = chosen;
    }
  }
  // Any pre-review checklist was measured on a different text snapshot.
  delete result.atsQuality;
  assertCommittedResume(result);
  return result;
};

export const keepOriginalResumeTailoring = (review) => resolveResumeTailoringReview(review,
  Object.fromEntries((review?.suggestions || []).map(({ id }) => [id, { choice: 'original', reviewId: review.reviewId }])));
