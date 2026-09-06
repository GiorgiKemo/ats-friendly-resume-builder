import React, { useState } from 'react';
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
  onCampaignAction,
  onSaveAnswers,
}) => {
  const [mode, setMode] = useState('prepare');
  const [limit, setLimit] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState({});
  const installed = Boolean(browserAgentState?.installed);
  const isRunning = Boolean(browserAgentState?.isRunning);
  const displayedMode = isRunning ? browserAgentState.campaign?.mode || mode : mode;
  const displayedLimit = isRunning ? browserAgentState.campaign?.limit || limit : limit;
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
      value: (isRunning && browserAgentState.campaign?.resumeTitle) || selectedResumeLabel || 'No default resume',
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
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm dark:border-blue-900/60 dark:from-[#080a0d] dark:via-[#101318] dark:to-[#0b1220]">
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
            Set up once. Apply from your browser.
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Use your saved resume and profile to autofill job applications as the job seeker. Discovered jobs with links can flow straight into
            the browser agent, and you can still add a job link manually if one is missing.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            One approved saved resume is reused across this campaign. Applications needing an answer wait for you while the remaining queue continues.
          </p>

          {!installed && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Load the unpacked extension from the <span className="font-medium text-slate-700 dark:text-slate-200">dist-extension</span> folder,
              then refresh this page once.
            </p>
          )}
        </div>

        <div className="grid min-w-[240px] gap-2 sm:grid-cols-2 lg:w-[280px] lg:grid-cols-1">
          <Button
            onClick={() => onLaunch({ mode, limit, confirmed })}
            variant="primary"
            className="w-full justify-center"
            disabled={syncing || isRunning || !confirmed || !installed}
            animate={false}
          >
            {syncing ? 'Working...' : 'Start campaign'}
          </Button>
          {browserAgentState?.campaign && (
            <Button onClick={() => onCampaignAction(isRunning ? 'pause' : 'resume')} variant="outline" disabled={syncing} animate={false}>
              {isRunning ? 'Pause campaign' : 'Resume campaign'}
            </Button>
          )}
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

      <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm font-medium"><label htmlFor="campaign-mode">Application mode</label>
            <select id="campaign-mode" className="mt-2 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              value={displayedMode} disabled={isRunning} onChange={event => { setMode(event.target.value); setConfirmed(false); }}>
              <option value="prepare">Prepare for my review</option>
              <option value="submit">Submit automatically</option>
            </select>
          </div>
          <div className="text-sm font-medium"><label htmlFor="campaign-limit">Maximum applications per day</label>
            <input id="campaign-limit" className="mt-2 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              type="number" min="1" max="50" value={displayedLimit} disabled={isRunning}
              onChange={event => { setLimit(Number(event.target.value)); setConfirmed(false); }} />
          </div>
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm leading-6">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={isRunning || confirmed} disabled={isRunning} onChange={event => setConfirmed(event.target.checked)} />
          <span>Use my saved profile and selected resume for the queued jobs{displayedMode === 'submit' ? ', and submit applications when all required answers are resolved' : ', then leave final submission to me'}. Pause individual applications for verification, sensitive answers, or uncertainty.</span>
        </label>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Keep your browser and ResumeATS open. Approval lasts up to 8 hours in this browser session. The daily limit includes applications started today (UTC).</p>
      </div>

      {(browserAgentState?.queue || []).some(job => job.status === 'needs_review') && (
        <section className="mt-5" aria-labelledby="campaign-attention-title">
          <h4 id="campaign-attention-title" className="font-semibold">Needs your attention</h4>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Answer new questions in your career profile, sync it, and retry. Check the employer result before retrying any attempted submission.</p>
          {(browserAgentState.queue || []).filter(job => job.status === 'needs_review').map(job => (
            <div key={job.id} className="mt-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <button type="button" onClick={() => onCampaignAction('open', job.id)} className="min-h-10 text-left font-medium text-blue-700 underline dark:text-blue-300">{job.title || 'Application'}{job.company ? ` · ${job.company}` : ''}</button>
              <p className="mt-1 text-sm">{job.lastError}</p>
              {(job.reviewFields || []).map((field, index) => (
                <div key={index} className="mt-3 text-sm">
                  <label htmlFor={`campaign-answer-${job.id}-${index}`}>{field.label}: {field.reason}</label>
                  {!field.sensitive && !job.submitAttemptedAt && <textarea id={`campaign-answer-${job.id}-${index}`} rows={2} maxLength={4000}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    placeholder="Save an answer for this employer" value={answerDrafts[job.id]?.[field.label] || ''}
                    onChange={event => setAnswerDrafts(current => ({ ...current, [job.id]: { ...current[job.id], [field.label]: event.target.value } }))} />}
                </div>
              ))}
              {Object.values(answerDrafts[job.id] || {}).some(answer => answer.trim()) && (
                <button type="button" disabled={syncing} className="mr-4 mt-2 min-h-10 text-sm font-medium text-blue-700 dark:text-blue-300" onClick={async () => {
                  const saved = await onSaveAnswers(job, Object.entries(answerDrafts[job.id]).map(([question, answer]) => ({ question, answer })));
                  if (saved) setAnswerDrafts(current => ({ ...current, [job.id]: {} }));
                }}>Save answers and retry</button>
              )}
              {!job.submitAttemptedAt && <button type="button" disabled={syncing} onClick={() => onCampaignAction('retry', job.id)} className="mt-2 min-h-10 text-sm font-medium text-blue-700 dark:text-blue-300">Retry after review</button>}
            </div>
          ))}
        </section>
      )}

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
            <label htmlFor="manual-job-link" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Optional Manual Job Link
            </label>
            <input
              id="manual-job-link"
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
        <span>New jobs are discovered using your saved search preferences when the queue is empty.</span>
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
  onCampaignAction: PropTypes.func.isRequired,
  onSaveAnswers: PropTypes.func.isRequired,
};

export default BrowserAgentControlCard;
