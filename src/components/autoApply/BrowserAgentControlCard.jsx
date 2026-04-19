import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../ui';

const BrowserAgentControlCard = ({
  browserAgentState,
  readiness,
  selectedResumeLabel,
  syncing,
  manualJobUrl,
  onManualJobUrlChange,
  onAddJob,
  addingJob,
  onLaunch,
  onSync,
  onRefresh,
}) => {
  const installed = Boolean(browserAgentState?.installed);
  const isRunning = Boolean(browserAgentState?.isRunning);
  const queueSize = browserAgentState?.queueSize || 0;
  const lastSyncedAt = browserAgentState?.lastSyncedAt;

  const readinessItems = [
    {
      label: 'Extension',
      value: installed ? 'Connected' : 'Not detected',
      ready: readiness?.extensionInstalled,
    },
    {
      label: 'Resume',
      value: selectedResumeLabel || 'No default resume',
      ready: readiness?.hasSelectedResume,
    },
    {
      label: 'Career Profile',
      value: readiness?.hasProfile ? 'Ready' : 'Needs profile details',
      ready: readiness?.hasProfile,
    },
    {
      label: 'Job Links',
      value: `${readiness?.supportedJobsCount || 0} ready`,
      ready: (readiness?.supportedJobsCount || 0) > 0,
    },
  ];

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm dark:border-blue-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
              Browser Agent Beta
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              installed
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {installed ? 'Agent Connected' : 'Load Extension'}
            </span>
            {isRunning && (
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-1 text-xs font-medium text-white">
                Applying Now
              </span>
            )}
          </div>

          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            One-click job applications from your own browser
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Use your saved resume and profile to autofill job applications as the job seeker. Discovered jobs with links can flow straight into
            the browser agent, and you can still add a job link manually if one is missing.
          </p>

          {!installed && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Load the unpacked extension from the repo&apos;s <span className="font-medium text-slate-700 dark:text-slate-200">browser-agent</span> folder,
              then refresh this page once.
            </p>
          )}
        </div>

        <div className="grid min-w-[240px] gap-2 sm:grid-cols-2 lg:w-[280px] lg:grid-cols-1">
          <Button
            onClick={onLaunch}
            variant="primary"
            className="w-full justify-center"
            disabled={syncing}
            animate={false}
          >
            {syncing ? 'Launching...' : 'Launch One-Click Run'}
          </Button>
          <Button
            onClick={onSync}
            variant="outline"
            className="w-full justify-center"
            disabled={syncing}
            animate={false}
          >
            Sync Profile Only
          </Button>
          <Button
            onClick={onRefresh}
            variant="ghost"
            className="w-full justify-center"
            animate={false}
          >
            Refresh Agent Status
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {readinessItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                {item.label}
              </span>
              <span className={`h-2.5 w-2.5 rounded-full ${item.ready ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Optional Manual Job Link
            </label>
            <input
              type="url"
              value={manualJobUrl}
              onChange={(event) => onManualJobUrlChange(event.target.value)}
              placeholder="Paste any job posting or application URL"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Only use this if a discovered job is missing. The browser agent will also try to follow Apply buttons and land on the real application form.
            </p>
          </div>
          <Button
            onClick={onAddJob}
            variant="outline"
            className="w-full justify-center lg:w-auto"
            disabled={addingJob}
            animate={false}
          >
            {addingJob ? 'Adding...' : 'Add Job Link'}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Queue: {queueSize} jobs</span>
        <span>Providers: Universal web apply</span>
        {lastSyncedAt && <span>Last sync: {new Date(lastSyncedAt).toLocaleString()}</span>}
      </div>
    </div>
  );
};

BrowserAgentControlCard.propTypes = {
  browserAgentState: PropTypes.shape({
    installed: PropTypes.bool,
    isRunning: PropTypes.bool,
    queueSize: PropTypes.number,
    lastSyncedAt: PropTypes.string,
  }),
  readiness: PropTypes.shape({
    extensionInstalled: PropTypes.bool,
    hasSelectedResume: PropTypes.bool,
    hasProfile: PropTypes.bool,
    supportedJobsCount: PropTypes.number,
  }),
  selectedResumeLabel: PropTypes.string,
  syncing: PropTypes.bool,
  manualJobUrl: PropTypes.string,
  onManualJobUrlChange: PropTypes.func.isRequired,
  onAddJob: PropTypes.func.isRequired,
  addingJob: PropTypes.bool,
  onLaunch: PropTypes.func.isRequired,
  onSync: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
};

export default BrowserAgentControlCard;
