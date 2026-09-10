const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const reviewError = (message) => Object.assign(new Error(message), { code: 'TAILORING_REVIEW_REQUIRED' });

// The web bundle cannot import the Supabase Edge tree because Vercel excludes
// deploy-only functions. Keep this runtime-neutral guard local to the web app;
// the Edge adapter retains the equivalent guard in its shared tree.
export const assertCommittedResume = (value) => {
  if (isRecord(value) && (value.kind === 'resume-tailoring-review' || Object.hasOwn(value, 'baseResume')
    || Object.hasOwn(value, 'suggestions') || Object.hasOwn(value, 'tailoringReview'))) {
    throw reviewError('Review the AI wording before saving or exporting this resume.');
  }
};
