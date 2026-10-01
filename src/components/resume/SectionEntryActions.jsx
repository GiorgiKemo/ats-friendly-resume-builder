import React from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';

const PlusIcon = ({ className = 'h-4 w-4' }) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

PlusIcon.propTypes = { className: PropTypes.string };

/**
 * Empty state for list sections. It is the only add action on screen while
 * the list is empty, so the section header carries no duplicate button.
 */
export const SectionEmptyState = ({ title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center dark:border-slate-600 dark:bg-slate-900/40">
    <span aria-hidden="true" className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
      <PlusIcon className="h-5 w-5" />
    </span>
    <p className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</p>
    {description && (
      <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-slate-400">{description}</p>
    )}
    <Button onClick={onAction} className="mt-5 gap-2">
      <PlusIcon />
      {actionLabel}
    </Button>
  </div>
);

SectionEmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  actionLabel: PropTypes.string.isRequired,
  onAction: PropTypes.func.isRequired,
};

/** Single "add another" row shown below an existing list. */
export const AddEntryButton = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-200 dark:focus-visible:ring-offset-slate-900"
  >
    <PlusIcon />
    {label}
  </button>
);

AddEntryButton.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};
