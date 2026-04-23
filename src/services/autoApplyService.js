import { supabase } from './supabase';

/**
 * Helper to get the current authenticated user.
 */
const getAuthenticatedUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('User not authenticated');
  return user;
};

// ===================================================================
// Job Preferences
// ===================================================================

export const getJobPreferences = async () => {
  try {
    const user = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('job_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching job preferences:', error);
    return { data: null, error };
  }
};

export const saveJobPreferences = async (preferences) => {
  try {
    const user = await getAuthenticatedUser();

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
      is_active: preferences.is_active ?? false,
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

export const toggleAutoApply = async (isActive) => {
  try {
    const user = await getAuthenticatedUser();
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

export const getAutoApplyJobs = async (filters = {}) => {
  try {
    const user = await getAuthenticatedUser();
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
    console.error('Error fetching auto-apply jobs:', error);
    return { data: null, error };
  }
};

export const updateAutoApplyJob = async (id, updates) => {
  try {
    const user = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('auto_apply_jobs')
      .update(updates)
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

export const createAutoApplyJob = async (job) => {
  try {
    const user = await getAuthenticatedUser();
    const normalizedUrl = job.job_url?.trim();

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

export const skipAutoApplyJob = async (id) => {
  return updateAutoApplyJob(id, { status: 'skipped' });
};

// ===================================================================
// Auto-Apply Stats
// ===================================================================

export const getAutoApplyStats = async () => {
  try {
    const user = await getAuthenticatedUser();
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
    console.error('Error fetching auto-apply stats:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Auto-Apply Runs (history)
// ===================================================================

export const getAutoApplyRuns = async (limit = 10) => {
  try {
    const user = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('auto_apply_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching auto-apply runs:', error);
    return { data: null, error };
  }
};

// ===================================================================
// Gmail Connection
// ===================================================================

export const getGmailConnection = async () => {
  try {
    await getAuthenticatedUser();
    const { data, error } = await supabase
      .rpc('get_gmail_connection_status');

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching Gmail connection:', error);
    return { data: null, error };
  }
};

export const connectGmail = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth`,
      {
        method: 'POST',
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

export const disconnectGmail = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-disconnect`,
      {
        method: 'POST',
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

export const scanGmailReplies = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

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

export const triggerAutoApplyRun = async (options = {}) => {
  try {
    const user = await getAuthenticatedUser();
    const { data: { session } } = await supabase.auth.getSession();
    const discoverOnly = options.discoverOnly !== false;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-apply-run`,
      {
        method: 'POST',
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
    return { data, error: null };
  } catch (error) {
    console.error('Error triggering auto-apply run:', error);
    return { data: null, error };
  }
};
