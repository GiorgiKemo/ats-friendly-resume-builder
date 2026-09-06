const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const reviewError = (message) => Object.assign(new Error(message), { code: 'TAILORING_REVIEW_REQUIRED' });

// Keep this guard runtime-neutral so every save/export surface rejects review
// packets before normalizing or rendering them.
export const assertCommittedResume = (value) => {
  if (isRecord(value) && (value.kind === 'resume-tailoring-review' || Object.hasOwn(value, 'baseResume')
    || Object.hasOwn(value, 'suggestions') || Object.hasOwn(value, 'tailoringReview'))) {
    throw reviewError('Review the AI wording before saving or exporting this resume.');
  }
};
