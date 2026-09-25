import { supabase, supabaseUrl } from './supabase';
import { getAnalyticsRequestHeaders } from './analyticsConsent.js';
import { computeHuntStats, mapStatsFromRpc } from '../utils/jobInboxDedupe.js';

const getAuthenticatedSession = async () => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('User not authenticated');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token || session.user?.id !== user.id) {
    throw new Error('Your session expired. Sign in again to sync Job Inbox.');
  }
  return { user, session };
};

export const getJobInboxGmailConnection = async () => {
  try {
    await getAuthenticatedSession();
    const { data, error } = await supabase.rpc('get_gmail_connection_status');
    if (error) throw error;
    const connection = Array.isArray(data) ? data[0] : data;
    return { data: connection?.is_active ? connection : null, error: null };
  } catch (error) {
    console.error('Error fetching Job Inbox Gmail connection:', error);
    return { data: null, error };
  }
};

export const connectJobInboxGmail = async ({ returnPath = '/applications' } = {}) => {
  try {
    const { session } = await getAuthenticatedSession();
    const safePath = ['/auto-apply', '/analytics'].includes(returnPath) ? returnPath : '/applications';
    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ returnPath: safePath }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to initiate Gmail connection');
    }
    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Error connecting Job Inbox Gmail:', error);
    return { data: null, error };
  }
};

export const disconnectJobInboxGmail = async () => {
  try {
    const { session } = await getAuthenticatedSession();
    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to disconnect Gmail');
    }
    return { data: { success: true }, error: null };
  } catch (error) {
    console.error('Error disconnecting Job Inbox Gmail:', error);
    return { data: null, error };
  }
};

export const syncJobInbox = async () => {
  try {
    const { session } = await getAuthenticatedSession();
    const response = await fetch(`${supabaseUrl}/functions/v1/job-inbox-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...getAnalyticsRequestHeaders(),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to sync Job Inbox');
    }
    return { data: payload, error: null };
  } catch (error) {
    console.error('Error syncing Job Inbox:', error);
    return { data: null, error };
  }
};

export const getHuntStats = async (applicationsFallback = null) => {
  try {
    const { data, error } = await supabase.rpc('get_job_inbox_stats');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) return { data: mapStatsFromRpc(row), error: null };
    if (applicationsFallback) {
      return { data: computeHuntStats(applicationsFallback), error: null };
    }
    return { data: computeHuntStats([]), error: null };
  } catch (error) {
    if (applicationsFallback) {
      return { data: computeHuntStats(applicationsFallback), error: null };
    }
    console.error('Error loading hunt stats:', error);
    return { data: computeHuntStats([]), error };
  }
};

export const listInboxEvents = async ({ category = null, limit = 50 } = {}) => {
  try {
    const { user } = await getAuthenticatedSession();
    let query = supabase
      .from('job_inbox_events')
      .select('id, gmail_message_id, gmail_thread_id, direction, from_email, subject, snippet, internal_date, category, confidence, application_id, dedupe_key, company_guess, position_guess, classifier_reason, status_applied, previous_application_status, created_at')
      .eq('user_id', user.id)
      .order('internal_date', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error listing inbox events:', error);
    return { data: null, error };
  }
};

/**
 * Undo the last auto status change for an application (from previous_status).
 */
export const undoApplicationStatusChange = async (applicationId) => {
  try {
    const { user } = await getAuthenticatedSession();
    const { data: app, error: loadError } = await supabase
      .from('job_applications')
      .select('id, status, previous_status')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!app?.previous_status) {
      throw new Error('No previous status to restore for this application.');
    }
    const { data, error } = await supabase
      .from('job_applications')
      .update({
        status: app.previous_status,
        previous_status: null,
      })
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error undoing application status:', error);
    return { data: null, error };
  }
};

/**
 * Merge duplicate into keeper: move events, copy useful fields, delete duplicate.
 */
export const mergeApplications = async (keeperId, duplicateId) => {
  try {
    const { user } = await getAuthenticatedSession();
    if (keeperId === duplicateId) throw new Error('Cannot merge an application into itself.');

    const { data: rows, error: loadError } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', user.id)
      .in('id', [keeperId, duplicateId]);
    if (loadError) throw loadError;
    const keeper = rows?.find((r) => r.id === keeperId);
    const duplicate = rows?.find((r) => r.id === duplicateId);
    if (!keeper || !duplicate) throw new Error('Applications not found.');

    await supabase
      .from('job_inbox_events')
      .update({ application_id: keeperId })
      .eq('user_id', user.id)
      .eq('application_id', duplicateId);

    const { error: deleteError } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', duplicateId)
      .eq('user_id', user.id);
    if (deleteError) throw deleteError;

    return { data: keeper, error: null };
  } catch (error) {
    console.error('Error merging applications:', error);
    return { data: null, error };
  }
};
