import { supabase } from './supabase';

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
    query = query.order('applied_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

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
export const createApplication = async (application) => {
  try {
    const user = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: user.id,
        company: application.company,
        position: application.position,
        job_url: application.job_url || null,
        status: application.status || 'applied',
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
      .select('id')
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
        ...updates,
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

    // Query the application_analytics view (no .single() — views lack PK)
    const { data: analyticsRows, error: analyticsError } = await supabase
      .from('application_analytics')
      .select('*')
      .eq('user_id', user.id);

    if (analyticsError && analyticsError.code !== 'PGRST116') {
      throw analyticsError;
    }

    const analytics = analyticsRows?.[0] || null;

    // Get recent applications (last 30 days) for chart data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentApplications, error: recentError } = await supabase
      .from('job_applications')
      .select('id, company, position, status, applied_at')
      .eq('user_id', user.id)
      .gte('applied_at', thirtyDaysAgo.toISOString())
      .order('applied_at', { ascending: true });

    if (recentError) throw recentError;

    // Group recent applications by week for chart data
    const weeklyData = (recentApplications || []).reduce((acc, app) => {
      const date = new Date(app.applied_at);
      // Get the Monday of the week
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date.setDate(diff));
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!acc[weekKey]) {
        acc[weekKey] = { week: weekKey, count: 0, statuses: {} };
      }
      acc[weekKey].count += 1;
      acc[weekKey].statuses[app.status] = (acc[weekKey].statuses[app.status] || 0) + 1;

      return acc;
    }, {});

    return {
      analytics: analytics || null,
      weeklyData: Object.values(weeklyData),
      recentApplications: recentApplications || [],
      error: null,
    };
  } catch (error) {
    console.error('Error fetching application analytics:', error);
    return { analytics: null, weeklyData: [], recentApplications: [], error };
  }
};

/**
 * Bulk operations
 */

// Bulk update application statuses
export const bulkUpdateStatus = async (ids, status) => {
  try {
    const user = await getAuthenticatedUser();

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('No application IDs provided');
    }

    if (!status) {
      throw new Error('Status is required');
    }

    const { data, error } = await supabase
      .from('job_applications')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('user_id', user.id)
      .select();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error bulk updating application statuses:', error);
    return { data: null, error };
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
    const { data: applications, error: appError } = await supabase
      .from('job_applications')
      .select('id, status, resume_id, resumes(id, title)')
      .eq('user_id', user.id);

    if (appError) throw appError;

    // Group by resume and calculate metrics
    const resumeMap = {};

    (applications || []).forEach((app) => {
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
      const responseStatuses = ['phone_screen', 'interview', 'technical', 'offer', 'rejected'];
      if (responseStatuses.includes(app.status)) {
        entry.responses += 1;
      }

      // Count interview-stage statuses
      const interviewStatuses = ['interview', 'technical', 'offer'];
      if (interviewStatuses.includes(app.status)) {
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
