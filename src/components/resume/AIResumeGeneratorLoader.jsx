import { lazy, Suspense } from 'react';

const AIResumeGenerator = lazy(() => import('./AIResumeGenerator.jsx'));

const LoadingState = () => (
  <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" role="status" aria-live="polite">
    Loading AI resume tools…
  </div>
);

const AIResumeGeneratorLoader = () => (
  <Suspense fallback={<LoadingState />}>
    <AIResumeGenerator />
  </Suspense>
);

export default AIResumeGeneratorLoader;
