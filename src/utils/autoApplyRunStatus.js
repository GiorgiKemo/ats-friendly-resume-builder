// The server lease lasts fifteen minutes. A missing completion after that
// cannot be presented as a search that is still actively running.
export function autoApplyRunStatus(run, now = Date.now()) {
  const startedAt = Date.parse(run.started_at);
  return run.status === 'running' && Number.isFinite(startedAt) && now - startedAt > 15 * 60 * 1000
    ? 'interrupted' : run.status;
}
