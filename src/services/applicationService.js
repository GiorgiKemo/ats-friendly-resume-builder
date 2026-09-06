import { supabase } from './supabase';
import { getApplicationMetrics, getApplicationUpdates, hasApplicationResponse, INTERVIEW_STATUSES } from '../utils/applicationMetrics.js';

/**
 * Helper to get the current authenticated user.
 * Throws if the user is not authenticated.
 */
const getAuthenticatedUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('User not authenticated');
  return user;
};

// Supabase caps a single response at 1,000 rows by default. Fetch every page
// before computing all-time metrics or exposing the complete tracker list.
const getAllRows = async (query) => {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
};

/**
 * Job Application CRUD functions
 */

// Get all job applications for the current user
export const getApplications = async (filters = {}) => {
  try {
    const user = await getAuthenticatedUser();

    let query = supabase
      .from('job_applications')
      .select('*, resumes(id, title)')
      .eq('user_id', user.id);

    // Filter by status
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // Search by company or position
    if (filters.search) {
      // Escape special LIKE pattern characters in user input
      const escapedSearch = filters.search.replace(/[%_\\]/g, '\\$&');
      const searchTerm = `%${escapedSearch}%`;
      query = query.or(`company.ilike.${searchTerm},position.ilike.${searchTerm}`);
    }

    // Filter by date range
    if (filters.dateRange) {
      if (filters.dateRange.from) {
        query = query.gte('applied_at', filters.dateRange.from);
      }
      if (filters.dateRange.to) {
        query = query.lte('applied_at', filters.dateRange.to);
      }
    }

    // Order by applied_at descending (most recent first)
    query = query.order('applied_at', { ascending: false }).order('id', { ascending: true });

    const data = await getAllRows(query);

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching applications:', error);
    return { data: null, error };
  }
};

// Get a single application by ID
export const getApplicationById = async (id) => {
  try {
    const user = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('job_applications')
      .select('*, resumes(id, title)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching application:', error);
    return { data: null, error };
  }
};

// Create a new job application
export const createApplication = async (application, expectedUserId) => {
  try {
    const user = await getAuthenticatedUser();
    if (expectedUserId && user.id !== expectedUserId) {
      throw new Error('Your account changed before the job could be tracked.');
    }
    const status = application.status || 'applied';
    const values = getApplicationUpdates({ ...application, company: application.company, position: application.position, status });

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: user.id,
        company: values.company,
        position: values.position,
        job_url: values.job_url || null,
        status,
        applied_at: status === 'saved' ? null : (application.applied_at || new Date().toISOString()),
        response_at: values.response_at || null,
        job_description: application.job_description || null,
        salary_range: application.salary_range || null,
        location: application.location || null,
        resume_id: application.resume_id || null,
        notes: application.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating application:', error);
    return { data: null, error };
  }
};

// Update an application (status change, notes, etc.)
export const updateApplication = async (id, updates) => {
  try {
    const user = await getAuthenticatedUser();

    // Verify ownership before updating
    const { data: existing, error: checkError } = await supabase
      .from('job_applications')
      .select('id, status, applied_at, response_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (checkError) {
      throw new Error('Application not found or you do not have permission to update it');
    }

    if (!existing) {
      throw new Error('Application not found');
    }

    const { data, error } = await supabase
      .from('job_applications')
      .update({
        ...getApplicationUpdates(updates, existing),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error updating application:', error);
    return { data: null, error };
  }
};

// Delete an application
export const deleteApplication = async (id) => {
  try {
    const user = await getAuthenticatedUser();

    // Verify ownership before deleting
    const { data: existing, error: checkError } = await supabase
      .from('job_applications')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (checkError) {
      throw new Error('Application not found or you do not have permission to delete it');
    }

    if (!existing) {
      throw new Error('Application not found');
    }

    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return { data: { id }, error: null };
  } catch (error) {
    console.error('Error deleting application:', error);
    return { data: null, error };
  }
};

/**
 * Analytics functions
 */

// Get analytics data for the current user
export const getApplicationAnalytics = async () => {
  try {
    const user = await getAuthenticatedUser();

    // Read one complete cohort so lifetime rates cannot silently mix a view's
    // lifetime total with only the last 30 days of status counts.
    const allApplications = await getAllRows(supabase
      .from('job_applications')
      .select('id, company, position, status, applied_at, response_at')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: true })
      .order('id', { ascending: true }));
    const metrics = getApplicationMetrics(allApplications);
    const cutoff = Date.now() - 30 * 86400000;
    const recentApplications = allApplications.filter((application) =>
      application.status !== 'saved' && application.applied_at &&
      Number.isFinite(new Date(application.applied_at).getTime()) &&
      new Date(application.applied_at).getTime() >= cutoff
    );

    // Group recent applications by week for chart data
    const weeklyData = (recentApplications || []).reduce((acc, app) => {
      const date = new Date(app.applied_at);
      // Get the Monday of the week
      const day = date.getUTCDay();
      const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date.setUTCDate(diff));
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!acc[weekKey]) {
        acc[weekKey] = { week: weekKey, count: 0, statuses: {} };
      }
      acc[weekKey].count += 1;
      acc[weekKey].statuses[app.status] = (acc[weekKey].statuses[app.status] || 0) + 1;

      return acc;
    }, {});

    return {
      metrics,
      weeklyData: Object.values(weeklyData),
      recentApplications: recentApplications || [],
      error: null,
    };
  } catch (error) {
    console.error('Error fetching application analytics:', error);
    return { metrics: null, weeklyData: [], recentApplications: [], error };
  }
};

/**
 * Bulk operations
 */

// Bulk update application statuses
export const bulkUpdateStatus = async (ids, status) => {
  const changed = [];
  try {
    const user = await getAuthenticatedUser();
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('No application IDs provided');
    const uniqueIds = [...new Set(ids)];
    const timestamp = new Date().toISOString();
    // Validate once and compute each row's timestamp transition before grouping.
    getApplicationUpdates({ status }, {}, timestamp);
    const existing = await getAllRows(supabase.from('job_applications')
      .select('id, status, applied_at, response_at').in('id', uniqueIds).eq('user_id', user.id).order('id'));
    if (existing.length !== uniqueIds.length) throw new Error('One or more applications were not found or do not belong to you.');
    const groups = new Map();
    for (const application of existing) {
      const payload = { ...getApplicationUpdates({ status }, application, timestamp), updated_at: timestamp };
      const key = JSON.stringify(payload);
      if (!groups.has(key)) groups.set(key, { payload, ids: [] });
      groups.get(key).ids.push(application.id);
    }
    for (const group of groups.values()) {
      const { data, error } = await supabase.from('job_applications').update(group.payload)
        .in('id', group.ids).eq('user_id', user.id).select();
      if (error) throw error;
      changed.push(...(data || []));
    }
    return { data: changed, error: null };
  } catch (error) {
    console.error('Error bulk updating application statuses:', error);
    // Groups are separate requests, so retain successes if a later group fails.
    return { data: changed.length ? changed : null, error };
  }
};

/**
 * Resume performance tracking
 */

// Get applications grouped by resume for resume performance tracking
export const getResumePerformance = async () => {
  try {
    const user = await getAuthenticatedUser();

    // Get all applications with their associated resume info
    const applications = await getAllRows(supabase
      .from('job_applications')
      .select('id, status, response_at, resume_id, resumes(id, title)')
      .eq('user_id', user.id)
      .order('id', { ascending: true }));

    // Group by resume and calculate metrics
    const resumeMap = {};

    (applications || []).forEach((app) => {
      if (app.status === 'saved') return;
      const resumeId = app.resume_id || 'no_resume';
      const resumeTitle = app.resumes?.title || 'No Resume Linked';

      if (!resumeMap[resumeId]) {
        resumeMap[resumeId] = {
          resume_id: resumeId === 'no_resume' ? null : resumeId,
          resume_title: resumeTitle,
          total_applications: 0,
          responses: 0,
          interviews: 0,
          offers: 0,
          rejections: 0,
        };
      }

      const entry = resumeMap[resumeId];
      entry.total_applications += 1;

      // Count statuses that indicate a response was received
      if (hasApplicationResponse(app)) {
        entry.responses += 1;
      }

      // Count interview-stage statuses
      if (INTERVIEW_STATUSES.includes(app.status)) {
        entry.interviews += 1;
      }

      if (app.status === 'offer') {
        entry.offers += 1;
      }

      if (app.status === 'rejected') {
        entry.rejections += 1;
      }
    });

    // Calculate rates
    const performance = Object.values(resumeMap).map((entry) => ({
      ...entry,
      response_rate: entry.total_applications > 0
        ? Math.round((entry.responses / entry.total_applications) * 100)
        : 0,
      interview_rate: entry.total_applications > 0
        ? Math.round((entry.interviews / entry.total_applications) * 100)
        : 0,
    }));

    // Sort by total applications descending
    performance.sort((a, b) => b.total_applications - a.total_applications);

    return { data: performance, error: null };
  } catch (error) {
    console.error('Error fetching resume performance:', error);
    return { data: null, error };
  }
};
