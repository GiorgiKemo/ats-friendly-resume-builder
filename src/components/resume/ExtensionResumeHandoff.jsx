import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useResume } from '../../context/ResumeContext';
import Button from '../ui/Button';
import {
  getBrowserAgentResumeHandoff,
  completeBrowserAgentResumeHandoff,
  cancelBrowserAgentResumeHandoff,
  loadBrowserAgentSavedResume,
} from '../../services/browserAgentService';
import { buildResumeTextLines } from '../../utils/resumeExportText';

const safeJobUrl = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};

const ExtensionResumeHandoff = ({ onImport, hasDraftContent, hasUnfinishedWork, savedResume, canTailor = false }) => {
  const { user } = useAuth();
  const { resumes = [], loading, error: libraryError, fetchUserResumes } = useResume();
  const refreshLibraryRef = useRef(fetchUserResumes);
  refreshLibraryRef.current = fetchUserResumes;
  const location = useLocation();
  const handoffId = new URLSearchParams(location.search).get('extensionRequest') || '';
  const scope = `${user?.id || ''}:${handoffId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const requestRef = useRef(null);
  const mountedRef = useRef(false);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ scope, phase: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [selectedId, setSelectedId] = useState('');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const request = { scope };
    requestRef.current = request;
    setState({ scope, phase: 'loading' });
    setSelectedId('');
    setReplaceConfirmed(false);
    if (handoffId && user?.id) {
      getBrowserAgentResumeHandoff(handoffId).then((handoff) => {
        if (requestRef.current !== request || activeScope.current !== scope) return;
        if (handoff?.handoffId !== handoffId || handoff.ownerId !== user.id || !safeJobUrl(handoff.jobSnapshot?.url) || !Number.isFinite(handoff.expiresAt) || handoff.expiresAt <= Date.now()) {
          throw new Error('This job selection has expired or belongs to another account. Choose the job again in the extension.');
        }
        setState({ scope, phase: 'choose', handoff });
        void refreshLibraryRef.current();
      }).catch((error) => {
        if (requestRef.current === request && activeScope.current === scope) setState({ scope, phase: 'error', error: error.message || 'Could not open this job selection.' });
      });
    }
    return () => { mountedRef.current = false; requestRef.current = null; };
  }, [scope, handoffId, user?.id, reload]);

  if (!handoffId) return null;
  const current = state.scope === scope ? state : { phase: 'loading' };
  const busy = ['loading', 'previewing', 'selecting', 'cancelling'].includes(current.phase);
  const job = current.handoff?.jobSnapshot;
  const expired = current.handoff?.expiresAt <= Date.now();
  const isActiveView = () => mountedRef.current && activeScope.current === scope && stateRef.current === current;
  const isCurrent = (request) => mountedRef.current && requestRef.current === request && activeScope.current === scope;
  const canUseHandoff = () => {
    if (!isActiveView()) return false;
    if (current.handoff?.expiresAt <= Date.now()) {
      setState({ ...current, error: 'This selection expired. Choose this job again in the extension.' });
      return false;
    }
    return true;
  };

  const preview = async (resume) => {
    if (!canUseHandoff() || busy || requestRef.current?.busy || !current.handoff || !resume?.id || !Number.isSafeInteger(resume.revision) || resume.revision < 1) return;
    const request = { scope, busy: true };
    requestRef.current = request;
    setState({ ...current, phase: 'previewing', preview: null, error: '' });
    try {
      const loaded = await loadBrowserAgentSavedResume({ resumeId: resume.id, expectedRevision: resume.revision, expectedUserId: user.id });
      if (!isCurrent(request)) return;
      if (loaded?.id !== resume.id || loaded.revision !== resume.revision) throw new Error('The saved version changed. Refresh the list and preview it again.');
      setState({ ...current, phase: 'preview', preview: loaded, previewText: buildResumeTextLines(loaded).join('\n'), error: '' });
    } catch (error) {
      if (isCurrent(request)) setState({ ...current, phase: 'choose', preview: null, error: error.message || 'Could not preview this saved version.' });
    } finally { if (isCurrent(request)) request.busy = false; }
  };

  const complete = async () => {
    if (!canUseHandoff() || current.phase !== 'preview' || requestRef.current?.busy || !current.preview) return;
    const request = { scope, busy: true };
    requestRef.current = request;
    setState({ ...current, phase: 'selecting', error: '' });
    try {
      const result = await completeBrowserAgentResumeHandoff({ handoffId, resumeId: current.preview.id, expectedRevision: current.preview.revision });
      if (!isCurrent(request)) return;
      if (result?.status !== 'ready' || result.handoffId !== handoffId || result.resume?.id !== current.preview.id || result.resume.revision !== current.preview.revision) {
        throw new Error('The extension did not confirm this saved version. Return to the extension and choose it again.');
      }
      setState({ ...current, phase: 'ready', error: '' });
    } catch (error) {
      if (isCurrent(request)) setState({ ...current, phase: 'preview', error: error.message || 'Selection failed. Your preview is still here; try again.' });
    } finally { if (isCurrent(request)) request.busy = false; }
  };

  const cancel = async () => {
    if (!isActiveView() || busy || requestRef.current?.busy) return;
    const request = { scope, busy: true };
    requestRef.current = request;
    setState({ ...current, phase: 'cancelling', error: '' });
    try {
      const result = await cancelBrowserAgentResumeHandoff(handoffId);
      if (isCurrent(request) && (result?.status !== 'cancelled' || result.handoffId !== handoffId)) throw new Error('The extension did not confirm cancellation. Try again or close the original job tab.');
      if (isCurrent(request)) setState({ scope, phase: 'cancelled' });
    } catch (error) {
      if (isCurrent(request)) setState({ ...current, error: error.message || 'Could not cancel. Try again.' });
    } finally { if (isCurrent(request)) request.busy = false; }
  };

  const importJob = () => {
    if (!canUseHandoff() || !canTailor || busy || requestRef.current?.busy || !job || hasUnfinishedWork) return;
    if (hasDraftContent && !replaceConfirmed) { setReplaceConfirmed(true); return; }
    if (onImport(job, handoffId) !== false) {
      setReplaceConfirmed(false);
      setState({ ...current, imported: true, error: '' });
    }
  };

  return (
    <section aria-labelledby="extension-resume-heading" className="mb-6 space-y-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-500/30 dark:bg-slate-800 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Browser extension</p>
        <h2 id="extension-resume-heading" className="mt-1 text-xl font-semibold text-gray-900 dark:text-slate-100">Choose a resume for this job</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Use an existing saved version for free, or tailor a new one below. Nothing is generated or sent to an employer by opening this chooser.</p>
      </div>
      {job && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/60">
          <p className="font-semibold text-gray-900 dark:text-slate-100">{job.title || 'Captured job'}{job.company ? ` at ${job.company}` : ''}</p>
          <a href={safeJobUrl(job.url)} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-700 underline dark:text-blue-300">{job.url}</a>
          <details className="mt-3">
            <summary className="cursor-pointer font-medium">Captured job description</summary>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{job.description || 'No description was captured. Check the original posting before tailoring.'}</p>
          </details>
        </div>
      )}
      <div role="status" className="text-sm text-gray-700 dark:text-slate-200">
        {current.phase === 'loading' && (user?.id ? 'Connecting to your extension…' : 'Sign in to the account connected to your extension.')}
        {current.phase === 'previewing' && 'Loading the exact saved version…'}
        {current.phase === 'selecting' && 'Preparing this saved version locally and confirming it with your extension…'}
        {current.phase === 'cancelling' && 'Cancelling this selection…'}
        {current.phase === 'ready' && `Selected: ${current.preview.title || 'Resume'}, version ${current.preview.revision}. It has not been attached. Return to the original job tab and choose Autofill when you are ready to share it.`}
        {current.phase === 'cancelled' && 'Selection cancelled. Your saved resumes and unfinished tailoring work have not been changed.'}
        {current.imported && current.phase !== 'ready' && 'Captured job imported below. Generate only when you are ready, review each change, then save. Return here to preview and select the saved version.'}
      </div>
      {(current.error || expired) && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{expired ? 'This selection expired. Choose this job again in the extension.' : current.error}</p>}
      {current.phase === 'error' && <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Retry connection</Button>}
      {current.phase === 'ready' && <Button variant="ghost" onClick={cancel}>Cancel job selection</Button>}
      {current.handoff && !['ready', 'cancelled'].includes(current.phase) && !expired && (
        <>
          <div className="space-y-3">
            <label htmlFor="extension-saved-resume" className="block text-sm font-medium text-gray-900 dark:text-slate-100">Saved resume</label>
            <select id="extension-saved-resume" value={selectedId} disabled={busy || loading} onChange={(event) => { setSelectedId(event.target.value); setState({ ...current, phase: 'choose', preview: null, error: '' }); }} className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              <option value="">{loading ? 'Loading saved resumes…' : 'Choose a saved resume'}</option>
              {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title || 'Untitled resume'} — version {resume.revision}{resume.updatedAt ? ` · ${new Date(resume.updatedAt).toLocaleDateString()}` : ''}</option>)}
            </select>
            {!loading && !resumes.length && <p className="text-sm text-gray-600 dark:text-slate-300">No saved resumes yet. Create one in the builder, or tailor and save one below, then refresh this list.</p>}
            {libraryError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{libraryError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || !selectedId} onClick={() => preview(resumes.find((resume) => resume.id === selectedId))}>Preview saved version</Button>
              <Button variant="ghost" disabled={busy || loading} onClick={() => { setState({ ...current, phase: 'choose', preview: null, error: '' }); void fetchUserResumes(); }}>Refresh list</Button>
              {savedResume?.id && Number.isSafeInteger(savedResume.revision) && <Button variant="outline" disabled={busy} onClick={() => { setSelectedId(savedResume.id); void preview(savedResume); }}>Preview newly saved version</Button>}
            </div>
          </div>
          {current.preview && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-slate-100">{current.preview.title || 'Resume'} — version {current.preview.revision}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-300">PDF content preview. The extension uses a text-native PDF of this saved version, without adding details from your current profile. Selecting it does not certify its accuracy.</p>
              <pre tabIndex={0} aria-label="Saved resume PDF content preview" className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white p-4 font-sans text-sm leading-relaxed text-gray-900 dark:border-slate-600">{current.previewText}</pre>
              <p className="text-sm text-gray-700 dark:text-slate-200">This job selection expires 30 minutes after opening and is kept in extension session storage. Expired files are removed on the next cleanup or extension wake. Autofill is a separate action that shares this resume with the employer site; the site may upload it before final submission.</p>
              <Button disabled={busy} onClick={complete}>Use this saved version for this job</Button>
            </div>
          )}
          <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
            {!canTailor && <p className="mb-2 text-sm text-gray-600 dark:text-slate-300">AI tailoring requires Premium. Choosing an existing saved resume is free.</p>}
            {hasUnfinishedWork && <p className="mb-2 text-sm text-gray-600 dark:text-slate-300">Finish or explicitly discard your current review below before importing another job. Your unfinished work has not been replaced.</p>}
            {replaceConfirmed && <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">Replace the job description and job location currently in the form with this captured job? Your other settings and saved resumes will stay unchanged.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || hasUnfinishedWork || !canTailor} onClick={importJob}>{replaceConfirmed ? 'Replace job details and continue' : 'Tailor a new resume for this job'}</Button>
              {replaceConfirmed && <Button variant="ghost" onClick={() => setReplaceConfirmed(false)}>Keep current form</Button>}
              <Button variant="ghost" disabled={busy} onClick={cancel}>Cancel job selection</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

ExtensionResumeHandoff.propTypes = {
  onImport: PropTypes.func.isRequired,
  hasDraftContent: PropTypes.bool,
  hasUnfinishedWork: PropTypes.bool,
  savedResume: PropTypes.object,
  canTailor: PropTypes.bool,
};

export default ExtensionResumeHandoff;
