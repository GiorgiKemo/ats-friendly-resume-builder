import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { Button, Pagination } from '../components/ui';
import { motion } from 'framer-motion';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import BrowserAgentControlCard from '../components/autoApply/BrowserAgentControlCard';
import { fadeInUp, fadeInLeft, fadeInRight } from '../utils/animationVariants';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { getUserProfile } from '../services/userProfileService';
import {
  getJobPreferences,
  saveJobPreferences,
  toggleAutoApply,
  createAutoApplyJob,
  getAutoApplyJobs,
  getAutoApplyStats,
  getAutoApplyRuns,
  triggerAutoApplyRun,
  updateAutoApplyJob,
  getGmailConnection,
  connectGmail,
  disconnectGmail,
  scanGmailReplies,
} from '../services/autoApplyService';
import {
  buildBrowserAgentProfile,
  buildBrowserAgentQueue,
  clearBrowserAgentQueue,
  getBrowserAgentReadiness,
  getBrowserAgentState,
  getSupportedBrowserAgentJobs,
  parseDirectAtsJobUrl,
  pingBrowserAgent,
  queueBrowserAgentJobs,
  startBrowserAgentRun,
  syncBrowserAgentProfile,
} from '../services/browserAgentService';

const surfaceClass = 'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-slate-950/30';
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-slate-900 placeholder:text-gray-400 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-inner dark:shadow-slate-950/20';
const inputShellClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-950/80 dark:shadow-inner dark:shadow-slate-950/20';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1';
const helpTextClass = 'text-xs text-gray-500 dark:text-slate-400';

// ===================================================================
// Stat Card Component
// ===================================================================
const StatCard = ({ label, value, icon, color, subtitle }) => (
  <motion.div
    className={`${surfaceClass} p-5 transition-shadow duration-200 ease-out hover:shadow-lg dark:hover:shadow-slate-950/40 will-change-transform`}
    whileHover={{ y: -4 }}
    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-500 dark:text-slate-400">{label}</span>
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${color}`}>{icon}</span>
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
    {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>}
  </motion.div>
);

// ===================================================================
// Status Badge
// ===================================================================
const StatusBadge = ({ status }) => {
  const styles = {
    discovered: 'border border-gray-300 bg-gray-50 text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
    queued: 'border border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300',
    applying: 'border border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    applied: 'border border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300',
    replied: 'border border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300',
    interview: 'border border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    rejected: 'border border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300',
    skipped: 'border border-gray-300 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
    failed: 'border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.discovered}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ===================================================================
// Match Score Bar
// ===================================================================
const MatchScore = ({ score }) => {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-slate-300">{score}%</span>
    </div>
  );
};

// ===================================================================
// Tag Input Component
// ===================================================================
const TagInput = ({ label, tags, onChange, placeholder, tooltip }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        onChange([...tags, inputValue.trim()]);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="mb-4">
      <label className={labelClass}>
        {label}
        {tooltip && <span className="ml-1 text-xs text-gray-400 dark:text-slate-500">({tooltip})</span>}
      </label>
      <div className={inputShellClass}>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-sm text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none dark:text-sky-300 dark:hover:text-sky-100"
                aria-label={`Remove ${tag}`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        />
      </div>
    </div>
  );
};

// ===================================================================
// Setup Wizard - Step Indicator
// ===================================================================
const StepIndicator = ({ currentStep, totalSteps }) => (
  <div className="flex items-center justify-center gap-2 mb-8">
    {Array.from({ length: totalSteps }, (_, i) => {
      const step = i + 1;
      const isActive = step === currentStep;
      const isCompleted = step < currentStep;
      return (
        <React.Fragment key={step}>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-all duration-300 ${
            isActive
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
              : isCompleted
                ? 'bg-green-500 text-white'
                : 'border-2 border-gray-300 text-gray-400 dark:border-slate-600 dark:text-slate-500'
          }`}>
            {isCompleted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : step}
          </div>
          {i < totalSteps - 1 && (
            <div className={`w-12 h-0.5 rounded-full transition-colors duration-300 ${
              isCompleted ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'
            }`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ===================================================================
// Main Auto-Apply Page
// ===================================================================
const AutoApply = () => {
  const { user } = useAuth();
  const { resumes, fetchUserResumes, getResumeById } = useResume();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Setup wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedResumeId, setSelectedResumeId] = useState('');

  // Data state
  const [preferences, setPreferences] = useState(null);
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [gmailConnection, setGmailConnection] = useState(null);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [careerProfile, setCareerProfile] = useState(null);
  const [browserAgentState, setBrowserAgentState] = useState({
    installed: false,
    isRunning: false,
    queueSize: 0,
    version: null,
    lastSyncedAt: null,
  });
  const [browserAgentBusy, setBrowserAgentBusy] = useState(false);
  const [manualAtsUrl, setManualAtsUrl] = useState('');
  const [addingManualAtsJob, setAddingManualAtsJob] = useState(false);
  const [jobFilter, setJobFilter] = useState('all');
  const [jobsPage, setJobsPage] = useState(1);
  const [dashPage, setDashPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const JOBS_PER_PAGE = 10;
  const DASH_PER_PAGE = 6;
  const HISTORY_PER_PAGE = 5;

  // Form state for preferences
  const [form, setForm] = useState({
    job_titles: [],
    skills: [],
    locations: [],
    remote_preference: 'any',
    experience_level: 'mid',
    salary_min: '',
    salary_max: '',
    industries: [],
    excluded_companies: [],
    daily_limit: 10,
    speed: 'moderate',
    sender_name: '',
    reply_to_email: '',
    default_resume_id: '',
  });

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsRes, statsRes, jobsRes, runsRes, gmailRes] = await Promise.all([
        getJobPreferences(),
        getAutoApplyStats(),
        getAutoApplyJobs({ limit: 50 }),
        getAutoApplyRuns(5),
        getGmailConnection(),
      ]);

      if (prefsRes.data) {
        setPreferences(prefsRes.data);
        setForm({
          job_titles: prefsRes.data.job_titles || [],
          skills: prefsRes.data.skills || [],
          locations: prefsRes.data.locations || [],
          remote_preference: prefsRes.data.remote_preference || 'any',
          experience_level: prefsRes.data.experience_level || 'mid',
          salary_min: prefsRes.data.salary_min || '',
          salary_max: prefsRes.data.salary_max || '',
          industries: prefsRes.data.industries || [],
          excluded_companies: prefsRes.data.excluded_companies || [],
          daily_limit: prefsRes.data.daily_limit || 10,
          speed: prefsRes.data.speed || 'moderate',
          sender_name: prefsRes.data.sender_name || '',
          reply_to_email: prefsRes.data.reply_to_email || '',
          default_resume_id: prefsRes.data.default_resume_id || '',
        });
        setSelectedResumeId(prefsRes.data.default_resume_id || '');
      }

      if (statsRes.data) setStats(statsRes.data);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (runsRes.data) setRuns(runsRes.data);
      if (gmailRes.data) setGmailConnection(gmailRes.data);
    } catch (err) {
      console.error('Failed to load auto-apply data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCareerProfile = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      setCareerProfile(profile);
      return profile;
    } catch (error) {
      console.error('Failed to load career profile:', error);
      setCareerProfile(null);
      return null;
    }
  }, []);

  const refreshBrowserAgentState = useCallback(async () => {
    try {
      const state = await getBrowserAgentState();
      setBrowserAgentState({
        installed: Boolean(state?.installed),
        isRunning: Boolean(state?.isRunning),
        queueSize: state?.queueSize || 0,
        version: state?.version || null,
        lastSyncedAt: state?.lastSyncedAt || null,
      });
      return true;
    } catch {
      setBrowserAgentState((prev) => ({
        ...prev,
        installed: false,
        isRunning: false,
        queueSize: 0,
      }));
      return null;
    }
  }, []);

  const reconcileBrowserAgentQueue = useCallback(async (queue = []) => {
    if (!Array.isArray(queue) || queue.length === 0 || jobs.length === 0) {
      return false;
    }

    const jobMap = new Map(jobs.map((job) => [job.id, job]));
    const updates = queue.flatMap((job) => {
      const current = jobMap.get(job.id);
      if (!current) return [];

      if (job.status === 'opening' && current.status !== 'applying') {
        return [{
          id: job.id,
          updates: {
            status: 'applying',
            failure_reason: null,
          },
        }];
      }

      if (job.status === 'completed') {
        if (
          current.status !== 'applied'
          || current.sent_via !== 'browser_agent'
          || current.failure_reason
        ) {
          return [{
            id: job.id,
            updates: {
              status: 'applied',
              applied_at: job.submittedAt || current.applied_at || new Date().toISOString(),
              failure_reason: null,
              sent_via: 'browser_agent',
            },
          }];
        }
      }

      if (job.status === 'failed') {
        const nextFailureReason = job.lastError || 'Browser agent failed to submit the application';
        if (current.status !== 'failed' || current.failure_reason !== nextFailureReason) {
          return [{
            id: job.id,
            updates: {
              status: 'failed',
              failure_reason: nextFailureReason,
            },
          }];
        }
      }

      return [];
    });

    if (updates.length === 0) {
      return false;
    }

    await Promise.all(updates.map((entry) => updateAutoApplyJob(entry.id, entry.updates)));
    return true;
  }, [jobs]);

  useEffect(() => {
    if (user) {
      (async () => {
        await Promise.all([
          loadData(),
          fetchUserResumes(),
          refreshCareerProfile(),
        ]);

        const state = await refreshBrowserAgentState();
        if (state?.installed) {
          const updated = await reconcileBrowserAgentQueue(state.queue || []);
          if (updated) {
            await loadData();
          }
        }
      })();
    }
  }, [user, loadData, fetchUserResumes, refreshCareerProfile, reconcileBrowserAgentQueue, refreshBrowserAgentState]);

  useEffect(() => {
    const handleFocus = () => {
      refreshBrowserAgentState();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshBrowserAgentState]);

  useEffect(() => {
    if (!browserAgentState.isRunning) return undefined;

    const intervalId = window.setInterval(async () => {
      const state = await refreshBrowserAgentState();
      if (state?.installed) {
        const updated = await reconcileBrowserAgentQueue(state.queue || []);
        if (updated) {
          await loadData();
        } else {
          loadData();
        }
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [browserAgentState.isRunning, loadData, reconcileBrowserAgentQueue, refreshBrowserAgentState]);

  // Handle Gmail OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const gmailStatus = params.get('gmail');
    if (gmailStatus === 'connected') {
      const email = params.get('email');
      toast.success(`Gmail connected: ${email || 'success'}`);
      setGmailConnection({ email, is_active: true, connected_at: new Date().toISOString() });
      // Clean URL
      window.history.replaceState(null, '', window.location.pathname + '#/auto-apply');
    } else if (gmailStatus === 'error') {
      toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`);
      window.history.replaceState(null, '', window.location.pathname + '#/auto-apply');
    }
  }, []);

  // Save preferences
  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const { data, error } = await saveJobPreferences(form);
      if (error) throw error;
      setPreferences(data);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save preferences');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Toggle auto-apply on/off
  const handleToggleAutoApply = async () => {
    if (!preferences) {
      toast.error('Please save your job preferences first');
      setActiveTab('settings');
      return;
    }
    if (form.job_titles.length === 0) {
      toast.error('Add at least one job title before activating');
      setActiveTab('settings');
      return;
    }

    try {
      const newState = !preferences.is_active;
      const { error } = await toggleAutoApply(newState);
      if (error) throw error;
      setPreferences((prev) => ({ ...prev, is_active: newState }));
      toast.success(newState ? 'Auto-apply activated!' : 'Auto-apply paused');
    } catch (err) {
      toast.error('Failed to toggle auto-apply');
      console.error(err);
    }
  };

  // Trigger manual run
  const handleTriggerRun = async () => {
    setTriggering(true);
    const runPromise = triggerAutoApplyRun({ discoverOnly: true });

    try {
      const result = await Promise.race([
        runPromise.then((response) => ({ ...response, timedOut: false })),
        new Promise((resolve) => {
          window.setTimeout(() => resolve({ data: null, error: null, timedOut: true }), 8000);
        }),
      ]);

      if (result.timedOut) {
        toast.success('Discovery request was sent. The server is still working, so I cleared the spinner and will keep refreshing.');

        runPromise
          .then((finalResult) => {
            if (finalResult?.error) {
              toast.error(finalResult.error.message || 'The discovery run failed');
              return;
            }

            loadData();
          })
          .catch((error) => {
            toast.error(error.message || 'The discovery run failed');
          });

        window.setTimeout(loadData, 3000);
        window.setTimeout(loadData, 12000);
        return;
      }

      if (result.error) throw result.error;
      toast.success('Discovery run started! Jobs will appear shortly.');
      setTimeout(loadData, 3000);
    } catch (err) {
      toast.error('Failed to start discovery run');
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    try {
      const { data, error } = await connectGmail();
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error('Failed to start Gmail connection');
      console.error(err);
      setConnectingGmail(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm('Disconnect Gmail? Applications will be sent via Brevo instead.')) return;
    try {
      const { error } = await disconnectGmail();
      if (error) throw error;
      setGmailConnection(null);
      toast.success('Gmail disconnected');
    } catch (err) {
      toast.error('Failed to disconnect Gmail');
      console.error(err);
    }
  };

  const handleScanReplies = async () => {
    try {
      toast.success('Scanning inbox for replies...');
      const { data } = await scanGmailReplies();
      if (data?.total_classified > 0) {
        toast.success(`Found ${data.total_classified} new replies!`);
        loadData();
      } else {
        toast.success('No new replies found');
      }
    } catch {
      toast.error('Failed to scan inbox');
    }
  };

  const handleAddManualAtsJob = async () => {
    const parsed = parseDirectAtsJobUrl(manualAtsUrl);

    if (!parsed) {
      toast.error('Paste a valid job posting or application URL.');
      return;
    }

    if (jobs.some((job) => job.job_url === parsed.normalizedUrl)) {
      toast.success('That ATS link is already in your queue.');
      setManualAtsUrl('');
      return;
    }

    setAddingManualAtsJob(true);
    try {
      const { data, error } = await createAutoApplyJob({
        title: parsed.title,
        company: parsed.company,
        job_url: parsed.normalizedUrl,
        status: 'queued',
        source: `browser_agent_${parsed.providerId || 'generic'}`,
      });

      if (error) throw error;

      setJobs((prev) => [data, ...prev]);
      setManualAtsUrl('');
      toast.success(`${parsed.providerLabel} job link added to your autofill queue.`);
    } catch (error) {
      toast.error(error.message || 'Failed to add ATS application link');
      console.error(error);
    } finally {
      setAddingManualAtsJob(false);
    }
  };

  const syncBrowserAgent = useCallback(async ({ startRun = false } = {}) => {
    setBrowserAgentBusy(true);

    try {
      const extensionDetected = await pingBrowserAgent().then(() => true).catch(() => false);
      if (!extensionDetected) {
        throw new Error('Browser agent not detected. Load the extension from the browser-agent folder and refresh this page.');
      }

      const resumeId = form.default_resume_id || selectedResumeId || preferences?.default_resume_id;
      if (!resumeId) {
        setActiveTab('settings');
        throw new Error('Choose a default resume before launching browser auto-apply.');
      }

      const supportedJobs = getSupportedBrowserAgentJobs(jobs);
      if (supportedJobs.length === 0) {
        throw new Error('No job links are queued yet. Run discovery first, or add a job link manually, then launch the browser agent.');
      }

      const [resume, profile] = await Promise.all([
        getResumeById(resumeId),
        careerProfile ? Promise.resolve(careerProfile) : refreshCareerProfile(),
      ]);

      const browserProfile = await buildBrowserAgentProfile({
        user,
        preferences: { ...preferences, ...form, default_resume_id: resumeId },
        resume,
        userProfile: profile,
        autoSubmit: true,
      });

      await syncBrowserAgentProfile(browserProfile);

      if (startRun) {
        await clearBrowserAgentQueue();
      }

      await queueBrowserAgentJobs({
        jobs: buildBrowserAgentQueue(supportedJobs),
      });

      if (startRun) {
        await startBrowserAgentRun();
      }

      await refreshBrowserAgentState();

      return {
        queuedJobs: supportedJobs.length,
        selectedResume: resume,
      };
    } finally {
      setBrowserAgentBusy(false);
    }
  }, [
    careerProfile,
    form,
    getResumeById,
    jobs,
    preferences,
    refreshBrowserAgentState,
    refreshCareerProfile,
    selectedResumeId,
    user,
  ]);

  const handleSyncBrowserAgent = async () => {
    try {
      const result = await syncBrowserAgent({ startRun: false });
      toast.success(`Browser agent synced with ${result.queuedJobs} queued job${result.queuedJobs === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to sync browser agent');
      console.error(error);
    }
  };

  const handleLaunchBrowserAgent = async () => {
    try {
      const result = await syncBrowserAgent({ startRun: true });
      toast.success(`Browser agent started on ${result.queuedJobs} queued job${result.queuedJobs === 1 ? '' : 's'}. Keep Chrome open while it applies.`);
    } catch (error) {
      toast.error(error.message || 'Failed to start browser agent');
      console.error(error);
    }
  };

  // ===================================================================
  // Resume selection handler for wizard step 1
  // ===================================================================
  const handleSelectResume = (resumeId) => {
    setSelectedResumeId(resumeId);
    const resume = resumes.find((r) => r.id === resumeId);
    if (!resume) return;

    const pi = resume.personalInfo || resume.personal_info || {};
    const skills = resume.skills || [];

    const jobTitles = pi.jobTitle ? [pi.jobTitle] : [];
    const locations = pi.location ? [pi.location] : [];
    const skillNames = skills.map((s) => (typeof s === 'string' ? s : s.name || s.skill || '')).filter(Boolean);

    setForm((prev) => ({
      ...prev,
      default_resume_id: resumeId,
      job_titles: jobTitles.length > 0 ? jobTitles : prev.job_titles,
      locations: locations.length > 0 ? locations : prev.locations,
      skills: skillNames.length > 0 ? skillNames : prev.skills,
      sender_name: pi.fullName || prev.sender_name,
      reply_to_email: pi.email || prev.reply_to_email,
    }));
  };

  // ===================================================================
  // Wizard: Save prefs + activate + trigger first run
  // ===================================================================
  const handleFinishSetup = async () => {
    setSaving(true);
    try {
      const { data, error } = await saveJobPreferences(form);
      if (error) throw error;
      setPreferences(data);

      // Activate
      const { error: toggleErr } = await toggleAutoApply(true);
      if (toggleErr) throw toggleErr;
      setPreferences((prev) => ({ ...prev, is_active: true }));

      // Trigger first run
      await triggerAutoApplyRun({ discoverOnly: true });
      toast.success('You are live! Job discovery is running.');
      setTimeout(loadData, 3000);
    } catch (err) {
      toast.error('Something went wrong during setup');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Filtered jobs
  const filteredJobs = jobFilter === 'all' ? jobs : jobs.filter((j) => j.status === jobFilter);
  const jobsTotalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const paginatedJobs = filteredJobs.slice((jobsPage - 1) * JOBS_PER_PAGE, jobsPage * JOBS_PER_PAGE);
  const dashTotalPages = Math.max(1, Math.ceil(jobs.length / DASH_PER_PAGE));
  const paginatedDashJobs = jobs.slice((dashPage - 1) * DASH_PER_PAGE, dashPage * DASH_PER_PAGE);
  const historyTotalPages = Math.max(1, Math.ceil(runs.length / HISTORY_PER_PAGE));
  const paginatedRuns = runs.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE);
  const selectedResume = resumes.find((resume) => resume.id === (form.default_resume_id || selectedResumeId || preferences?.default_resume_id));
  const supportedBrowserJobs = getSupportedBrowserAgentJobs(jobs);
  const browserAgentReadiness = getBrowserAgentReadiness({
    browserAgentState,
    selectedResume,
    userProfile: careerProfile,
    jobs,
  });

  // Determine if we should show the setup wizard (no prefs saved yet)
  const showWizard = !loading && !preferences;

  useEffect(() => {
    setJobsPage((page) => Math.min(Math.max(page, 1), jobsTotalPages));
  }, [jobsTotalPages]);

  useEffect(() => {
    setDashPage((page) => Math.min(Math.max(page, 1), dashTotalPages));
  }, [dashTotalPages]);

  useEffect(() => {
    setHistoryPage((page) => Math.min(Math.max(page, 1), historyTotalPages));
  }, [historyTotalPages]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: (
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    )},
    { id: 'jobs', label: 'Jobs', icon: (
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )},
    { id: 'settings', label: 'Settings', icon: (
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'history', label: 'Run History', icon: (
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  // ===================================================================
  // Loading State
  // ===================================================================
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // ===================================================================
  // SETUP WIZARD (first-time users)
  // ===================================================================
  if (showWizard) {
    return (
      <motion.div
        className="container mx-auto max-w-2xl px-4 py-12 text-slate-900 dark:text-slate-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <AnimatedElement variants={fadeInUp}>
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Set up Auto-Apply</h1>
            <p className="text-gray-500 dark:text-slate-400 mt-2">3 quick steps and you are done</p>
          </div>

          <StepIndicator currentStep={wizardStep} totalSteps={3} />

          {/* ======= STEP 1: Pick your resume ======= */}
          {wizardStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`${surfaceClass} p-6`}>
                <h2 className="text-xl font-semibold mb-1">Pick your resume</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
                  We will use this to fill in your details and tailor each application.
                </p>

                {resumes.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 dark:text-slate-300 font-medium mb-1">No resumes yet</p>
                    <p className="text-sm text-gray-400 dark:text-slate-400">Create a resume first, then come back here.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {resumes.map((r) => {
                      const pi = r.personalInfo || r.personal_info || {};
                      const isSelected = selectedResumeId === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleSelectResume(r.id)}
                          className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-400 shadow-sm shadow-blue-500/10'
                              : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-slate-100">
                                {pi.fullName || r.title || 'Untitled Resume'}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-slate-400">
                                {[pi.jobTitle, pi.location].filter(Boolean).join(' -- ') || 'No details'}
                              </p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 dark:border-slate-600'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => setWizardStep(2)}
                    variant="primary"
                    animate={false}
                    disabled={!selectedResumeId}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 2: What kind of jobs? ======= */}
          {wizardStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`${surfaceClass} p-6`}>
                <h2 className="text-xl font-semibold mb-1">What kind of jobs?</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
                  We pre-filled this from your resume. Tweak anything that looks off.
                </p>

                <TagInput
                  label="Job Titles"
                  tags={form.job_titles}
                  onChange={(v) => setForm((p) => ({ ...p, job_titles: v }))}
                  placeholder="e.g. Software Engineer, Full Stack Developer"
                  tooltip="press Enter to add"
                />

                <TagInput
                  label="Locations"
                  tags={form.locations}
                  onChange={(v) => setForm((p) => ({ ...p, locations: v }))}
                  placeholder="e.g. New York, San Francisco"
                  tooltip="press Enter to add"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Remote Preference</label>
                    <select
                      value={form.remote_preference}
                      onChange={(e) => setForm((p) => ({ ...p, remote_preference: e.target.value }))}
                      className={`${inputClass} pr-10`}
                    >
                      <option value="any">Any (remote, hybrid, or on-site)</option>
                      <option value="remote">Remote Only</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="onsite">On-site</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Daily Limit</label>
                    <select
                      value={form.daily_limit}
                      onChange={(e) => setForm((p) => ({ ...p, daily_limit: parseInt(e.target.value) }))}
                      className={`${inputClass} pr-10`}
                    >
                      <option value={5}>5 per day</option>
                      <option value={10}>10 per day (recommended)</option>
                      <option value={25}>25 per day</option>
                      <option value={50}>50 per day</option>
                    </select>
                    <p className={`mt-1 ${helpTextClass}`}>How many applications to send each day</p>
                  </div>
                </div>

                <div className="mt-6 flex justify-between">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                  >
                    Back
                  </button>
                  <Button
                    onClick={() => setWizardStep(3)}
                    variant="primary"
                    animate={false}
                    disabled={form.job_titles.length === 0}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 3: Connect & Go ======= */}
          {wizardStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`${surfaceClass} p-6`}>
                <h2 className="text-xl font-semibold mb-1">Connect and go</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
                  Choose how applications are sent, then hit start.
                </p>

                {/* Gmail connection */}
                {gmailConnection ? (
                  <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 mb-6 dark:border-green-500/20 dark:bg-green-950/30">
                    <div className="rounded-lg border border-green-200 bg-green-100 p-2 dark:border-green-700 dark:bg-green-950">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">Gmail connected</p>
                      <p className="text-xs text-green-600 dark:text-green-300">{gmailConnection.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 space-y-3">
                    <button
                      onClick={handleConnectGmail}
                      disabled={connectingGmail}
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-950/50 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {connectingGmail ? 'Connecting...' : 'Connect Gmail (recommended)'}
                    </button>
                    <p className="text-xs text-center text-gray-400 dark:text-slate-500">
                      Send applications from your real email. Better deliverability and looks more professional.
                    </p>
                    <p className="text-xs text-center text-gray-400 dark:text-slate-500">
                      Or skip this -- we will send from a platform address on your behalf.
                    </p>
                  </div>
                )}

                {/* Sender details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Your Name</label>
                    <input
                      type="text"
                      value={form.sender_name}
                      onChange={(e) => setForm((p) => ({ ...p, sender_name: e.target.value }))}
                      className={inputClass}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reply-to Email</label>
                    <input
                      type="email"
                      value={form.reply_to_email}
                      onChange={(e) => setForm((p) => ({ ...p, reply_to_email: e.target.value }))}
                      className={inputClass}
                      placeholder="you@email.com"
                    />
                    <p className={`mt-1 ${helpTextClass}`}>Employers will reply here</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                  >
                    Back
                  </button>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <button
                      onClick={handleFinishSetup}
                      disabled={saving || !form.sender_name || !form.reply_to_email}
                      className="px-8 py-3 rounded-lg bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-green-600/20"
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Setting up...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Start Auto-Applying
                        </span>
                      )}
                    </button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatedElement>
      </motion.div>
    );
  }

  // ===================================================================
  // RETURNING USER DASHBOARD
  // ===================================================================
  return (
    <motion.div
      className="container mx-auto max-w-6xl px-4 py-8 text-slate-900 dark:text-slate-100"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <AnimatedElement variants={fadeInLeft}>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Auto-Apply</h1>
          <p className="text-gray-600 dark:text-slate-300 mt-1">AI finds and applies to jobs for you</p>
        </AnimatedElement>
        <AnimatedElement variants={fadeInRight}>
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              preferences?.is_active
                ? 'border border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300'
                : 'border border-gray-300 bg-gray-50 text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${preferences?.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-slate-500'}`} />
              {preferences?.is_active ? 'Active' : 'Paused'}
            </div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={handleToggleAutoApply}
                variant={preferences?.is_active ? 'outline' : 'primary'}
                animate={false}
              >
                {preferences?.is_active ? (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pause
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Activate
                  </span>
                )}
              </Button>
            </motion.div>
          </div>
        </AnimatedElement>
      </div>

      {/* Tab Navigation + Content */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Tabs */}
        <div className="md:w-1/4">
          <div className={`${surfaceClass} sticky top-4 p-4`}>
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-2 rounded-md transition-colors flex items-center text-sm font-medium ${
                    activeTab === tab.id
                      ? 'border border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/20 dark:bg-slate-800/90 dark:text-blue-200'
                      : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/80 hover:text-gray-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Quick action */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
              <Button
                onClick={handleTriggerRun}
                variant="primary"
                className="w-full flex justify-center items-center text-sm"
                animate={false}
                disabled={triggering || !preferences?.is_active}
              >
                {triggering ? (
                  <span className="flex items-center">
                    <svg className="animate-spin w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Discovering...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Discover Jobs
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="md:w-3/4">
          {/* ================= DASHBOARD TAB ================= */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Stats Grid */}
              <AnimatedElement variants={fadeInUp}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard
                    label="Applied"
                    value={stats?.total_applied || 0}
                    color="border-green-200 bg-green-100 text-green-600 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    subtitle={`${stats?.applied_today || 0} today`}
                  />
                  <StatCard
                    label="Opened"
                    value={stats?.total_opened || 0}
                    color="border-yellow-200 bg-yellow-100 text-yellow-600 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                    subtitle={`${stats?.open_rate || 0}% open rate`}
                  />
                  <StatCard
                    label="Replies"
                    value={stats?.total_replies || 0}
                    color="border-purple-200 bg-purple-100 text-purple-600 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300"
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                    subtitle={`${stats?.response_rate || 0}% rate`}
                  />
                  <StatCard
                    label="Interviews"
                    value={stats?.total_interviews || 0}
                    color="border-indigo-200 bg-indigo-100 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                  />
                </div>
              </AnimatedElement>

              {/* Today's Progress */}
              <AnimatedElement variants={fadeInUp} delay={0.1}>
                <div className={`${surfaceClass} p-5 mb-6`}>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3">Today's Applications</h3>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                      {stats?.applied_today || 0}
                      <span className="text-lg text-gray-400 dark:text-slate-500 font-normal">/{preferences?.daily_limit || 10}</span>
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
                        <motion.div
                          className="h-2.5 rounded-full bg-blue-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, ((stats?.applied_today || 0) / (preferences?.daily_limit || 10)) * 100)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedElement>

              <AnimatedElement variants={fadeInUp} delay={0.15}>
                <div className="mb-6">
                  <BrowserAgentControlCard
                    browserAgentState={browserAgentState}
                    readiness={browserAgentReadiness}
                    selectedResumeLabel={selectedResume?.title || selectedResume?.personalInfo?.fullName || ''}
                    syncing={browserAgentBusy}
                    manualJobUrl={manualAtsUrl}
                    onManualJobUrlChange={setManualAtsUrl}
                    onAddJob={handleAddManualAtsJob}
                    addingJob={addingManualAtsJob}
                    onLaunch={handleLaunchBrowserAgent}
                    onSync={handleSyncBrowserAgent}
                    onRefresh={refreshBrowserAgentState}
                  />
                  <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                    {supportedBrowserJobs.length > 0
                      ? `${supportedBrowserJobs.length} discovered or added job links are queued and ready for browser autofill.`
                      : 'Run job discovery first. Add a manual job link only if something is missing from the queue.'}
                  </p>
                </div>
              </AnimatedElement>

              {/* Recent Applications */}
              <AnimatedElement variants={fadeInUp} delay={0.2}>
                <div className={`${surfaceClass} overflow-hidden`}>
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Recent Applications</h3>
                  </div>
                  {jobs.length === 0 ? (
                    <div className="p-8 text-center">
                      <svg className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-gray-500 dark:text-slate-300 mb-2">No applications yet</p>
                      <p className="text-sm text-gray-400 dark:text-slate-400">Applications will appear here once auto-apply runs</p>
                    </div>
                  ) : (
                    <StaggeredContainer className="divide-y divide-gray-100 dark:divide-slate-700">
                      {paginatedDashJobs.map((job) => (
                        <StaggeredItem key={job.id}>
                          <a
                            href={job.job_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex px-6 py-3.5 items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${job.job_url ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{job.title}</p>
                                <StatusBadge status={job.status} />
                              </div>
                              <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{job.company}{job.location ? ` - ${job.location}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-3 ml-4">
                              {job.match_score > 0 && <MatchScore score={job.match_score} />}
                              <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                                {format(new Date(job.applied_at || job.created_at), 'MMM d')}
                              </span>
                              {job.job_url && (
                                <svg className="w-4 h-4 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              )}
                            </div>
                          </a>
                        </StaggeredItem>
                      ))}
                    </StaggeredContainer>
                  )}
                  <Pagination
                    currentPage={dashPage}
                    totalPages={dashTotalPages}
                    onPageChange={setDashPage}
                    totalItems={jobs.length}
                    pageSize={DASH_PER_PAGE}
                    itemLabel="jobs"
                  />
                </div>
              </AnimatedElement>
            </div>
          )}

          {/* ================= JOBS TAB ================= */}
          {activeTab === 'jobs' && (
            <div>
              {/* Filters */}
              <AnimatedElement variants={fadeInUp}>
                <div className={`${surfaceClass} mb-6 p-4`}>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'applied', label: 'Applied' },
                      { value: 'replied', label: 'Replied' },
                      { value: 'interview', label: 'Interview' },
                      { value: 'rejected', label: 'Rejected' },
                    ].map((f) => (
                      <button
                        key={f.value}
                        onClick={() => { setJobFilter(f.value); setJobsPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            jobFilter === f.value
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                              : 'border border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-800/90'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </AnimatedElement>

              {/* Job List */}
              <AnimatedElement variants={fadeInUp} delay={0.1}>
                <div className={`${surfaceClass} overflow-hidden`}>
                  {filteredJobs.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-gray-500 dark:text-slate-300">No jobs match this filter</p>
                    </div>
                  ) : (
                    <StaggeredContainer className="divide-y divide-gray-100 dark:divide-slate-700">
                      {paginatedJobs.map((job) => (
                        <StaggeredItem key={job.id}>
                          <a
                            href={job.job_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${job.job_url ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{job.title}</h4>
                                  <StatusBadge status={job.status} />
                                </div>
                                <p className="text-sm text-gray-600 dark:text-slate-300">
                                  {job.company}
                                  {job.contact_email && (
                                    <span className="ml-2 text-xs text-blue-500" title={job.contact_email}>
                                      <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                      </svg>
                                      {job.contact_email}
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-slate-400">
                                  {job.location && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      {job.location}
                                    </span>
                                  )}
                                  {job.salary_range && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      {job.salary_range}
                                    </span>
                                  )}
                                  {job.applied_at && (
                                    <span>Applied {format(new Date(job.applied_at), 'MMM d, yyyy')}</span>
                                  )}
                                  {job.email_opened_count > 0 && (
                                    <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-300" title={`Opened ${job.email_opened_count} time${job.email_opened_count > 1 ? 's' : ''}`}>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      Opened
                                    </span>
                                  )}
                                  {job.replied_at && (
                                    <span className="flex items-center gap-1 text-purple-600 dark:text-purple-300" title={`Replied ${format(new Date(job.replied_at), 'MMM d')}`}>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                      </svg>
                                      Replied
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 ml-4">
                                {job.match_score > 0 && <MatchScore score={job.match_score} />}
                                {job.job_url && (
                                  <svg className="w-4 h-4 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </a>
                        </StaggeredItem>
                      ))}
                    </StaggeredContainer>
                  )}
                  <Pagination
                    currentPage={jobsPage}
                    totalPages={jobsTotalPages}
                    onPageChange={setJobsPage}
                    totalItems={filteredJobs.length}
                    pageSize={JOBS_PER_PAGE}
                    itemLabel="jobs"
                  />
                </div>
              </AnimatedElement>
            </div>
          )}

          {/* ================= SETTINGS TAB ================= */}
          {activeTab === 'settings' && (
            <AnimatedElement variants={fadeInUp}>
              <div className={`${surfaceClass} p-6`}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">Settings</h2>

                {/* Resume */}
                <div className="mb-4">
                  <label className={labelClass}>Resume</label>
                  <select
                    value={form.default_resume_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      setForm((p) => ({ ...p, default_resume_id: id }));
                      if (id) handleSelectResume(id);
                    }}
                    className={`${inputClass} pr-10`}
                  >
                    <option value="">Select a resume...</option>
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.personalInfo?.fullName || r.personal_info?.fullName || r.title || 'Untitled Resume'}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-1 ${helpTextClass}`}>This resume will be tailored for each application</p>
                </div>

                {/* Job Titles */}
                <TagInput
                  label="Job Titles"
                  tags={form.job_titles}
                  onChange={(v) => setForm((p) => ({ ...p, job_titles: v }))}
                  placeholder="e.g. Software Engineer, Full Stack Developer"
                  tooltip="press Enter to add"
                />

                {/* Locations */}
                <TagInput
                  label="Locations"
                  tags={form.locations}
                  onChange={(v) => setForm((p) => ({ ...p, locations: v }))}
                  placeholder="e.g. New York, San Francisco"
                  tooltip="press Enter to add"
                />

                {/* Remote + Daily Limit */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Remote Preference</label>
                    <select
                      value={form.remote_preference}
                      onChange={(e) => setForm((p) => ({ ...p, remote_preference: e.target.value }))}
                      className={`${inputClass} pr-10`}
                    >
                      <option value="any">Any</option>
                      <option value="remote">Remote Only</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="onsite">On-site</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Daily Limit</label>
                    <select
                      value={form.daily_limit}
                      onChange={(e) => setForm((p) => ({ ...p, daily_limit: parseInt(e.target.value) }))}
                      className={`${inputClass} pr-10`}
                    >
                      <option value={5}>5 per day</option>
                      <option value={10}>10 per day</option>
                      <option value={25}>25 per day</option>
                      <option value={50}>50 per day</option>
                    </select>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-200 dark:border-slate-700 my-6" />

                {/* Gmail Connection */}
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">Email Connection</h3>
                <div className="mb-6">
                  {gmailConnection ? (
                    <div className="flex items-center justify-between rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-green-300 bg-green-100 p-2 dark:border-green-600 dark:bg-green-900">
                          <svg className="w-5 h-5 text-green-600 dark:text-green-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">Gmail Connected</p>
                          <p className="text-xs text-green-600 dark:text-green-400">{gmailConnection.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleScanReplies}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          Scan Replies
                        </button>
                        <button
                          onClick={handleDisconnectGmail}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-950">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-blue-200 bg-blue-100 p-2 dark:border-blue-700 dark:bg-blue-950">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Connect your Gmail</p>
                          <p className="text-xs text-blue-600 dark:text-blue-300">Send applications from your real email address</p>
                        </div>
                      </div>
                      <button
                        onClick={handleConnectGmail}
                        disabled={connectingGmail}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {connectingGmail ? 'Connecting...' : 'Connect Gmail'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Sender Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Sender Name</label>
                    <input
                      type="text"
                      value={form.sender_name}
                      onChange={(e) => setForm((p) => ({ ...p, sender_name: e.target.value }))}
                      className={inputClass}
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reply-to Email</label>
                    <input
                      type="email"
                      value={form.reply_to_email}
                      onChange={(e) => setForm((p) => ({ ...p, reply_to_email: e.target.value }))}
                      className={inputClass}
                      placeholder="your.email@example.com"
                    />
                    <p className={`mt-1 ${helpTextClass}`}>Employers will reply to this address</p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      onClick={handleSavePreferences}
                      variant="primary"
                      animate={false}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </motion.div>
                </div>
              </div>
            </AnimatedElement>
          )}

          {/* ================= HISTORY TAB ================= */}
          {activeTab === 'history' && (
            <AnimatedElement variants={fadeInUp}>
              <div className={`${surfaceClass} overflow-hidden`}>
                <div className="p-5 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Run History</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Previous auto-apply execution cycles</p>
                </div>

                {runs.length === 0 ? (
                  <div className="p-8 text-center">
                    <svg className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-gray-500 dark:text-slate-300">No runs yet</p>
                    <p className="text-sm text-gray-400 dark:text-slate-400 mt-1">Runs will appear here after auto-apply is activated</p>
                  </div>
                ) : (
                  <StaggeredContainer className="divide-y divide-gray-100 dark:divide-slate-700">
                    {paginatedRuns.map((run) => (
                      <StaggeredItem key={run.id}>
                        <div className="p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                run.status === 'completed' ? 'bg-green-500' :
                                run.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                run.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                              }`} />
                              <span className="text-sm font-medium text-gray-900 dark:text-slate-100 capitalize">{run.status}</span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              {format(new Date(run.started_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="flex gap-4 text-sm text-gray-600 dark:text-slate-300">
                            <span>{run.jobs_discovered} discovered</span>
                            <span className="text-green-600">{run.jobs_applied} applied</span>
                            <span className="text-gray-400 dark:text-slate-500">{run.jobs_skipped} skipped</span>
                            {run.jobs_failed > 0 && (
                              <span className="text-red-500 dark:text-red-300">{run.jobs_failed} failed</span>
                            )}
                          </div>
                          {run.error_message && (
                            <p className="mt-2 text-xs text-red-500 dark:text-red-300">{run.error_message}</p>
                          )}
                        </div>
                      </StaggeredItem>
                    ))}
                  </StaggeredContainer>
                )}
                <Pagination
                  currentPage={historyPage}
                  totalPages={historyTotalPages}
                  onPageChange={setHistoryPage}
                  totalItems={runs.length}
                  pageSize={HISTORY_PER_PAGE}
                  itemLabel="runs"
                />
              </div>
            </AnimatedElement>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AutoApply;
