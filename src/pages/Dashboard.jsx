import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import { TouchLink, Button, Pagination } from '../components/ui';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
// import { supabase } from '../services/supabase'; // Removed unused supabase
import { motion } from 'framer-motion';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp, scaleIn } from '../utils/animationVariants';
import { getResumeDisplayJobTitle } from '../utils/resumePresentation.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';

const RESUMES_PER_PAGE = 6;

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const {
    resumes,
    loading: resumeLoading,
    error,
    resumesError,
    fetchUserResumes,
    deleteResume,
  } = useResume();
  const {
    isPremium,
    loading: subscriptionLoading,
    subscriptionData,
    getRemainingAIGenerations,
    refreshSubscriptionStatus
  } = useSubscription();
  const navigate = useNavigate();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [resumesPage, setResumesPage] = useState(1);

  // Get remaining generations
  const remainingGenerations = getRemainingAIGenerations();

  // Calculate percentage for progress bar
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;
  const generationsPercentage = generationsLimit > 0
    ? Math.max(0, Math.min(100, (remainingGenerations / generationsLimit) * 100))
    : 0;

  const handleDeleteResume = async (id) => {
    const confirmed = await confirm({
      title: 'Delete this resume?',
      message: 'This permanently removes the saved resume. Make sure you have exported a copy if you still need it.',
      confirmLabel: 'Delete resume',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteResume(id);
      // Refresh the list of resumes after deletion
      await fetchUserResumes();
      toast.success('Resume deleted successfully');
    } catch { // _error was unused
      toast.error('Failed to delete resume');
    }
  };

  const handleEditResume = (id) => {
    navigate(`/builder/${id}`);
  };

  const isDashboardLoading = resumeLoading;
  const latestResume = resumes[0] || null;
  const latestResumeTargetRole = latestResume ? getResumeDisplayJobTitle(latestResume) : '';
  const targetedResumeCount = resumes.filter((resume) => Boolean(getResumeDisplayJobTitle(resume))).length;
  const canUseAiTailoring = isPremium && remainingGenerations > 0;
  const resumesTotalPages = Math.max(1, Math.ceil(resumes.length / RESUMES_PER_PAGE));
  const paginatedResumes = resumes.slice(
    (resumesPage - 1) * RESUMES_PER_PAGE,
    resumesPage * RESUMES_PER_PAGE,
  );

  useEffect(() => {
    setResumesPage((page) => Math.min(Math.max(page, 1), resumesTotalPages));
  }, [resumesTotalPages]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const renderActionButton = (action, variant = 'primary', className = '') => {
    if (!action) return null;

    const sharedProps = {
      animate: false,
      className,
      ariaLabel: action.label,
    };

    if (action.to) {
      return (
        <Button
          as="link"
          to={action.to}
          variant={variant}
          {...sharedProps}
        >
          {action.label}
        </Button>
      );
    }

    return (
      <Button
        onClick={action.onClick}
        variant={variant}
        {...sharedProps}
      >
        {action.label}
      </Button>
    );
  };

  const nextAction = (() => {
    if (isDashboardLoading) {
      return {
        badge: 'Loading workspace',
        title: 'Getting your resume workspace ready',
        description: 'We are checking your saved resumes, target roles, and tailoring capacity so the next recommendation is accurate.',
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (resumesError && resumes.length === 0) {
      return {
        badge: 'Workspace unavailable',
        title: 'We couldn’t load your resumes',
        description: 'Your saved resumes have not been changed. Try loading your workspace again.',
        primaryAction: { label: 'Try again', onClick: fetchUserResumes },
        secondaryAction: null,
      };
    }

    if (subscriptionLoading) {
      return resumes.length === 0
        ? {
          badge: 'Workspace ready',
          title: 'Create your first resume',
          description: 'Your workspace is ready. We are still checking your plan, but the free step-by-step editor is available now.',
          primaryAction: { label: 'Get started', to: '/new' },
          secondaryAction: null,
        }
        : {
          badge: 'Workspace ready',
          title: 'Keep working on your resume',
          description: 'Your saved resumes are ready. We are still checking your plan; you can open a resume or start another one now.',
          primaryAction: { label: 'Open my resume', onClick: () => handleEditResume(latestResume.id) },
          secondaryAction: { label: 'New resume', to: '/new' },
        };
    }

    if (resumes.length === 0) {
      return {
        badge: 'Start here',
        title: 'Create your first resume',
        description: 'Use the free step-by-step editor, or paste a job posting if you have Premium.',
        primaryAction: { label: 'Get started', to: '/new' },
        secondaryAction: null,
      };
    }

    if (!targetedResumeCount) {
      return {
        badge: 'Needs direction',
        title: 'Give one resume a clear target role',
        description: 'Your saved base is there, but it still needs a target job title or imported posting so tailoring and export stay focused.',
        primaryAction: { label: 'Open Latest Resume', onClick: () => handleEditResume(latestResume.id) },
        secondaryAction: isPremium
          ? { label: 'Paste a job posting', to: '/quick-resume' }
          : { label: 'Create another resume', to: '/new' },
      };
    }

    if (canUseAiTailoring) {
      return {
        badge: 'Ready to tailor',
        title: 'Tailor your next application in one pass',
        description: 'You already have a usable base resume and AI generations available. Paste a job description, generate a targeted version, then export or track the application.',
        primaryAction: { label: 'Tailor With AI', to: '/ai-generator' },
        secondaryAction: { label: 'Open Latest Resume', onClick: () => handleEditResume(latestResume.id) },
      };
    }

    if (isPremium) {
      return {
        badge: 'Keep moving',
        title: 'Edit, export, or apply with the resume you already have',
        description: 'Your latest resume is already pointed at a role. Make small changes, export a DOCX, or track the application while you wait for the next AI cycle.',
        primaryAction: { label: 'Open Latest Resume', onClick: () => handleEditResume(latestResume.id) },
        secondaryAction: { label: 'Track Applications', to: '/applications' },
      };
    }

    return {
      badge: 'Ready to go',
      title: 'Keep working on your resume',
      description: 'Open your latest resume to edit or export. Upgrade anytime for AI tailoring from a job posting.',
      primaryAction: { label: 'Open my resume', onClick: () => handleEditResume(latestResume.id) },
      secondaryAction: { label: 'New resume', to: '/new' },
    };
  })();

  const checklistItems = [
    {
      done: resumes.length > 0,
      label: resumes.length > 0 ? `You have ${resumes.length} saved resume${resumes.length === 1 ? '' : 's'}` : 'Create your first resume',
    },
    {
      done: targetedResumeCount > 0,
      label: targetedResumeCount > 0
        ? latestResumeTargetRole || 'Resume focus set'
        : 'Add a job title you are applying for',
    },
    {
      done: !subscriptionLoading && canUseAiTailoring,
      label: subscriptionLoading
        ? 'Checking Premium access'
        : isPremium
        ? (canUseAiTailoring ? 'AI tailoring available' : 'AI limit reached this month')
        : 'Optional: upgrade for AI from a job posting',
    },
  ];

  if (authLoading) {
    return (
      <div className="app-loading-viewport">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const aiStatusTone = remainingGenerations === 0 ? 'red' : remainingGenerations < 5 ? 'amber' : 'emerald';
  const aiBarClass = { red: 'bg-red-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500' }[aiStatusTone];

  return (
    <motion.div
      className="app-page max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <AnimatedElement variants={fadeInUp}>
        <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03] dark:border-slate-700 dark:bg-slate-900/70">
          <div className={`grid ${!subscriptionLoading ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
            <div className="p-6 md:p-8">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {nextAction.badge}
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
                {nextAction.title}
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
                {nextAction.description}
              </p>

              {(nextAction.primaryAction || nextAction.secondaryAction) && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  {renderActionButton(nextAction.primaryAction, 'primary', 'w-full sm:w-auto')}
                  {nextAction.secondaryAction && renderActionButton(nextAction.secondaryAction, 'outline', 'w-full sm:w-auto')}
                </div>
              )}

              {!isDashboardLoading && !resumesError && resumes.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2">
                  {checklistItems.map((item) => (
                    <li
                      key={item.label}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                        item.done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!subscriptionLoading && (
              <aside className="border-t border-slate-200 bg-slate-50/70 p-6 dark:border-slate-700 dark:bg-slate-800/40 lg:border-l lg:border-t-0">
                {isPremium ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Generation Limit</h2>
                      <button
                        type="button"
                        onClick={refreshSubscriptionStatus}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-700"
                        aria-label="Refresh AI generation count"
                        title="Refresh"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                        </svg>
                      </button>
                    </div>
                    <p className="mt-3 text-slate-900 dark:text-slate-100">
                      <span className="text-4xl font-bold tracking-tight">{remainingGenerations}</span>
                      <span className="ml-1.5 text-sm text-slate-500 dark:text-slate-400">/ {generationsLimit} remaining</span>
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                      <motion.div
                        className={`h-2 rounded-full ${aiBarClass}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${generationsPercentage}%` }}
                        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                      ></motion.div>
                    </div>
                    <p className={`mt-3 text-sm ${aiStatusTone === 'red' ? 'text-red-600 dark:text-red-400' : aiStatusTone === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {remainingGenerations === 0
                        ? "You've reached your monthly limit"
                        : remainingGenerations < 5
                          ? "You're running low on AI generations"
                          : 'Monthly AI generations for tailored resumes'}
                    </p>
                    <TouchLink
                      to="/ai-generator"
                      className={`mt-5 w-full rounded-lg text-sm font-semibold ${remainingGenerations === 0
                        ? 'cursor-not-allowed border border-slate-300 bg-white text-slate-500 opacity-60 dark:border-slate-600 dark:bg-slate-800'
                        : 'border border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'}`}
                      ariaLabel={remainingGenerations === 0 ? 'AI generation limit reached' : 'Use AI Generator'}
                      disabled={remainingGenerations === 0}
                    >
                      {remainingGenerations === 0 ? 'Limit Reached' : 'Use AI Generator'}
                    </TouchLink>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Premium</span>
                    <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">Tailor faster with AI</h2>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {['Draft wording from a job posting', 'Review every suggested change', 'Unlimited resume storage'].map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <TouchLink
                      to="/pricing"
                      className="mt-5 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                      ariaLabel="Upgrade to premium plan"
                    >
                      See Premium — $9.99/month
                    </TouchLink>
                  </>
                )}
              </aside>
            )}
          </div>
        </section>
      </AnimatedElement>

      {!resumeLoading && resumesError && resumes.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>We couldn&apos;t refresh your resumes. The previously loaded list is still available below.</p>
          <Button onClick={fetchUserResumes} ariaLabel="Try again" variant="outline" animate={false} className="mt-3">Try again</Button>
        </div>
      )}

      {!resumeLoading && error && !resumesError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <p>{error}</p>
          {resumes.length > 0 && <p className="mt-1">Your saved resumes are still available below.</p>}
        </div>
      )}

      {resumeLoading ? (
        <div className="app-loading-viewport">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true"></div>
        </div>
      ) : resumesError && resumes.length === 0 ? (
        <AnimatedElement variants={fadeInUp}>
          <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
            {resumesError}
          </div>
        </AnimatedElement>
      ) : resumes.length === 0 ? (
        <AnimatedElement variants={scaleIn}>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No resumes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
              We&apos;ll help you pick the easiest way to start — no technical knowledge needed.
            </p>
            <div className="mt-6 flex justify-center">
              <Button as="link" to="/new" animate={false}>
                Create my first resume
              </Button>
            </div>
          </div>
        </AnimatedElement>
      ) : (
        <>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Your working resumes</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Keep one clean base for each direction you apply in.
              </p>
            </div>
            <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
              {resumes.length} {resumes.length === 1 ? 'resume' : 'resumes'}
            </span>
          </div>

          <StaggeredContainer
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            staggerDelay={0.08}
            initialDelay={0.1}
            animateOnMount
          >
            {paginatedResumes.map((resume) => (
              <StaggeredItem key={resume.id}>
                <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition-[border-color,box-shadow] hover:border-blue-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-800">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" aria-hidden="true">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {(resume.personalInfo?.fullName || resume.title || 'Untitled Resume')}
                      </h3>
                      <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">
                        {getResumeDisplayJobTitle(resume) || 'Add a target job title'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      onClick={() => handleDeleteResume(resume.id)}
                      aria-label="Delete resume"
                      title="Delete resume"
                    >
                      <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>

                  <p className="mt-4 flex flex-1 items-end text-xs text-slate-500 dark:text-slate-400">
                    {resume.updatedAt
                      ? `Updated ${format(new Date(resume.updatedAt), 'MMM d, yyyy')}`
                      : 'Recently updated'}
                  </p>

                  <Button
                    variant="primary"
                    className="mt-4 w-full"
                    onClick={() => handleEditResume(resume.id)}
                    animate={false}
                  >
                    Open resume
                  </Button>
                </div>
              </StaggeredItem>
            ))}
            <StaggeredItem>
              <TouchLink
                to="/new"
                className="flex h-full min-h-[11.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-300"
                ariaLabel="New resume"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300" aria-hidden="true">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </span>
                New resume
              </TouchLink>
            </StaggeredItem>
          </StaggeredContainer>
          {resumesTotalPages > 1 && (
            <Pagination
              currentPage={resumesPage}
              totalPages={resumesTotalPages}
              onPageChange={setResumesPage}
              totalItems={resumes.length}
              pageSize={RESUMES_PER_PAGE}
              itemLabel="resumes"
              className="mt-5 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            />
          )}
        </>
      )}
      {confirmDialog}
    </motion.div>
  );
};

export default Dashboard;
