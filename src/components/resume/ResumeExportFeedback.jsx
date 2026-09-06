import React from 'react';

const ResumeExportFeedback = ({ feedback }) => {
  if (!feedback) return null;
  const isError = feedback.kind === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      aria-atomic="true"
      className={`rounded-lg border px-3 py-2 text-sm break-words ${isError
        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-200'}`}
    >
      {feedback.message}
    </p>
  );
};

export default ResumeExportFeedback;
