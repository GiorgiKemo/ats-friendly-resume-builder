export const APPLICATION_STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
export const RESPONSE_STATUSES = ['screening', 'interview', 'offer', 'rejected'];
export const INTERVIEW_STATUSES = ['interview', 'offer'];

export const hasApplicationResponse = (application) => Boolean(application.response_at) || RESPONSE_STATUSES.includes(application.status);

// Every rate uses submitted applications only. A saved role is not a submission.
export function getApplicationMetrics(applications = []) {
  const submitted = applications.filter((application) => application.status !== 'saved');
  const statusCounts = Object.fromEntries(APPLICATION_STATUSES.filter((status) => status !== 'saved').map((status) => [status, 0]));
  for (const application of submitted) {
    if (application.status in statusCounts) statusCounts[application.status] += 1;
  }
  const responseCount = submitted.filter(hasApplicationResponse).length;
  return {
    totalApplications: submitted.length,
    savedCount: applications.length - submitted.length,
    statusCounts,
    responseCount,
    responseRate: submitted.length ? Math.round(responseCount / submitted.length * 100) : 0,
    interviewCount: submitted.filter((application) => INTERVIEW_STATUSES.includes(application.status)).length,
    offerCount: statusCounts.offer,
  };
}

const EDITABLE_FIELDS = ['company', 'position', 'job_url', 'status', 'job_description', 'salary_range', 'location', 'resume_id', 'notes'];

export function getApplicationUpdates(updates, existing = {}, timestamp = new Date().toISOString()) {
  const payload = Object.fromEntries(EDITABLE_FIELDS.filter((field) => Object.hasOwn(updates, field)).map((field) => [field, updates[field]]));
  for (const field of ['company', 'position']) {
    if (field in payload) {
      payload[field] = typeof payload[field] === 'string' ? payload[field].trim() : '';
      if (!payload[field]) throw new Error(`${field === 'company' ? 'Company' : 'Position'} is required.`);
    }
  }
  if ('status' in payload && !APPLICATION_STATUSES.includes(payload.status)) throw new Error('Invalid application status.');
  if ('job_url' in payload) {
    const value = typeof payload.job_url === 'string' ? payload.job_url.trim() : '';
    if (value) {
      let url;
      try { url = new URL(value); } catch { throw new Error('Job URL must be a valid HTTP or HTTPS link.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Job URL must be a valid HTTP or HTTPS link.');
    }
    payload.job_url = value || null;
  }
  if ('resume_id' in payload && !payload.resume_id) payload.resume_id = null;
  if (payload.status && payload.status !== existing.status) {
    if (payload.status === 'saved') {
      payload.applied_at = null;
      payload.response_at = null;
    } else {
      if (!existing.applied_at) payload.applied_at = timestamp;
      if (!existing.response_at && RESPONSE_STATUSES.includes(payload.status)) payload.response_at = timestamp;
    }
  }
  return payload;
}
