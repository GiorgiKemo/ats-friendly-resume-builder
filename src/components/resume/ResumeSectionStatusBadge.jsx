import React from 'react';
import PropTypes from 'prop-types';

const toneMap = {
  complete: {
    label: 'Ready',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    dotClasses: 'bg-emerald-500',
  },
  inProgress: {
    label: 'Draft',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    dotClasses: 'bg-amber-500',
  },
  optional: {
    label: 'Optional',
    classes: 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
    dotClasses: 'bg-slate-400 dark:bg-slate-500',
  },
  todo: {
    label: 'To do',
    classes: 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
    dotClasses: 'bg-slate-400 dark:bg-slate-500',
  },
};

const ResumeSectionStatusBadge = ({ section, showText = true, className = '' }) => {
  const tone = section.complete
    ? 'complete'
    : section.inProgress
      ? 'inProgress'
      : section.optional
        ? 'optional'
        : 'todo';

  const config = toneMap[tone];

  if (!showText) {
    return (
      <span
        className={`inline-flex h-2.5 w-2.5 rounded-full ${config.dotClasses} ${className}`.trim()}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${config.classes} ${className}`.trim()}
    >
      {config.label}
    </span>
  );
};

ResumeSectionStatusBadge.propTypes = {
  section: PropTypes.shape({
    complete: PropTypes.bool,
    inProgress: PropTypes.bool,
    optional: PropTypes.bool,
  }).isRequired,
  showText: PropTypes.bool,
  className: PropTypes.string,
};

export default ResumeSectionStatusBadge;
