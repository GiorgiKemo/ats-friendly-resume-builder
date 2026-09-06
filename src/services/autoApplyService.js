import { supabase, supabaseUrl } from './supabase';
import { getSafeExternalUrl } from '../utils/urlSafety.js';

/**
 * Helper to get the current authenticated user.
 */
const getAuthenticatedUser = async ({ expectedUserId, signal } = {}, requireExpectedUser = false) => {
  signal?.throwIfAborted();
  if (requireExpectedUser && !expectedUserId) throw new Error('An account is required for this action');
  const { data: { user }, error } = await supabase.auth.getUser();
  signal?.throwIfAborted();
  if (error) throw error;
  if (!user) throw new Error('User not authenticated');
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your account changed. Reload Auto-Apply before continuing.');
  return user;
};

// Bind provider/extension actions to the same verified user and bearer token.
// A React remount cannot cancel an already-started async service continuation.
export const assertAutoApplyAccount = async (account) => {
  const user = await getAuthenticatedUser(account, true);
  const { data: { session }, error } = await supabase.auth.getSession();
  account.signal?.throwIfAborted();
  if (error) throw error;
  if (!session?.access_token || session.user?.id !== user.id) {
    throw new Error('Your account changed. Reload Auto-Apply before continuing.');
  }
  return { user, session };
};

// ===================================================================
// Job Preferences
// ===================================================================

export const getJobPreferences = async (account) => {
  try {
    const user = await getAuthenticatedUser(account);
    const { data, error } = await supabase
      .from('job_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (!account?.signal?.aborted) console.error('Error fetching job preferences:', error);
    return { data: null, error };
  }
};

export const saveJobPreferences = async (preferences, account) => {
  try {
    const user = await getAuthenticatedUser(account, true);

    const payload = {
      user_id: user.id,
      job_titles: preferences.job_titles || [],
      skills: preferences.skills || [],
      locations: preferences.locations || [],
      remote_preference: preferences.remote_preference || 'any',
      experience_level: preferences.experience_level || 'mid',
      salary_min: preferences.salary_min || null,
      salary_max: preferences.salary_max || null,
      industries: preferences.industries || [],
      excluded_companies: preferences.excluded_companies || [],
      // Activation has its own action. Saving filters must preserve the server's
      // current state, including a pause made in another tab.
      daily_limit: preferences.daily_limit || 10,
      speed: preferences.speed || 'moderate',
      sender_name: preferences.sender_name || null,
      reply_to_email: preferences.reply_to_email || null,
      default_resume_id: preferences.default_resume_id || null,
    };

    const { data, error } = await supabase
      .from('job_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error saving job preferences:', error);
    return { data: null, error };
  }
};

export const toggleAutoApply = async (isActive, account) => {
  try {
    const user = await getAuthenticatedUser(account, true);
    const { data, error } = await supabase
      .from('job_preferences')
      .update({ is_active: isActive })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error toggling auto-apply:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Auto-Apply Jobs
// ===================================================================

export const getAutoApplyJobs = async (filters = {}, account) => {
  try {
    const user = await getAuthenticatedUser(account);
    let query = supabase
      .from('auto_apply_jobs')
      .select('*')
      .eq('user_id', user.id);

    if (filters.status) {
      query = query.eq('status', filters.status);
    } else if (!filters.includeAll) {
      // By default, hide skipped and failed jobs — users only care about applied/replied/interview
      query = query.not('status', 'in', '("skipped","failed")');
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.or(`title.ilike.${term},company.ilike.${term}`);
    }

    query = query.order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (!account?.signal?.aborted) console.error('Error fetching auto-apply jobs:', error);
    return { data: null, error };
  }
};

export const updateAutoApplyJob = async (id, updates, account) => {
  try {
    const user = await getAuthenticatedUser(account, true);
    const safeUpdates = { ...updates };
    if (Object.hasOwn(safeUpdates, 'job_url')) {
      const normalizedUrl = getSafeExternalUrl(safeUpdates.job_url);
      if (!normalizedUrl) throw new Error('Job URL must be a valid HTTP or HTTPS link.');
      safeUpdates.job_url = normalizedUrl;
    }
    const { data, error } = await supabase
      .from('auto_apply_jobs')
      .update(safeUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating auto-apply job:', error);
    return { data: null, error };
  }
};

export const createAutoApplyJob = async (job, account) => {
  try {
    const user = await getAuthenticatedUser(account, true);
    const normalizedUrl = getSafeExternalUrl(job.job_url);

    if (!normalizedUrl) {
      throw new Error('A direct job application URL is required');
    }

    const { data: existing, error: existingError } = await supabase
      .from('auto_apply_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('job_url', normalizedUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return { data: existing, error: null, existing: true };
    }

    await getAuthenticatedUser(account, true);
    const { data, error } = await supabase
      .from('auto_apply_jobs')
      .insert({
        user_id: user.id,
        title: job.title || 'ATS application',
        company: job.company || 'Unknown company',
        location: job.location || null,
        salary_range: job.salary_range || null,
        job_url: normalizedUrl,
        contact_email: job.contact_email || null,
        job_description: job.job_description || null,
        match_score: job.match_score || 0,
        status: job.status || 'queued',
        source: job.source || 'browser_agent_manual',
        external_job_id: job.external_job_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null, existing: false };
  } catch (error) {
    console.error('Error creating auto-apply job:', error);
    return { data: null, error, existing: false };
  }
};

export const skipAutoApplyJob = async (id, account) => {
  return updateAutoApplyJob(id, { status: 'skipped' }, account);
};

// ===================================================================
// Auto-Apply Stats
// ===================================================================

export const getAutoApplyStats = async (account) => {
  try {
    const user = await getAuthenticatedUser(account);
    const { data, error } = await supabase
      .from('auto_apply_stats')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return {
      data: data || {
        total_discovered: 0,
        total_applied: 0,
        total_replies: 0,
        total_interviews: 0,
        total_rejected: 0,
        total_queued: 0,
        total_failed: 0,
        applied_today: 0,
        response_rate: 0,
        avg_match_score: 0,
      },
      error: null,
    };
  } catch (error) {
    if (!account?.signal?.aborted) console.error('Error fetching auto-apply stats:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Auto-Apply Runs (history)
// ===================================================================

export const getAutoApplyRuns = async (limit = 10, account) => {
  try {
    const user = await getAuthenticatedUser(account);
    const { data, error } = await supabase
      .from('auto_apply_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (!account?.signal?.aborted) console.error('Error fetching auto-apply runs:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Gmail Connection
// ===================================================================

export const getGmailConnection = async (account) => {
  try {
    await getAuthenticatedUser(account);
    const { data, error } = await supabase
      .rpc('get_gmail_connection_status');

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (error) {
    if (!account?.signal?.aborted) console.error('Error fetching Gmail connection:', error);
    return { data: null, error };
  }
};

export const connectGmail = async (account) => {
  try {
    const { session } = await assertAutoApplyAccount(account);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/gmail-auth`,
      {
        method: 'POST',
        signal: account.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to initiate Gmail connection');
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Error connecting Gmail:', error);
    return { data: null, error };
  }
};

export const disconnectGmail = async (account) => {
  try {
    const { session } = await assertAutoApplyAccount(account);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/gmail-disconnect`,
      {
        method: 'POST',
        signal: account.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to disconnect Gmail');
    }

    return { data: { success: true }, error: null };
  } catch (error) {
    console.error('Error disconnecting Gmail:', error);
    return { data: null, error };
  }
};

export const scanGmailReplies = async (account) => {
  try {
    const { session } = await assertAutoApplyAccount(account);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/gmail-scan`,
      {
        method: 'POST',
        signal: account.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to scan Gmail replies');
    }
    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Error scanning Gmail:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Trigger a manual auto-apply run (calls edge function)
// ===================================================================

export const triggerAutoApplyRun = async (options = {}, account) => {
  try {
    const { user, session } = await assertAutoApplyAccount(account);
    const discoverOnly = options.discoverOnly !== false;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/auto-apply-run`,
      {
        method: 'POST',
        signal: account.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          discover_only: discoverOnly,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to trigger auto-apply run');
    }

    const data = await response.json();
    if (!data || data.success !== true || data.error) {
      throw new Error(data?.error || 'Failed to trigger auto-apply run');
    }
    return { data, error: null };
  } catch (error) {
    console.error('Error triggering auto-apply run:', error);
    return { data: null, error };
  }
};
