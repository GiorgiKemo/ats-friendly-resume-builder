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

const RESUMES_PER_PAGE = 6;

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const {
    resumes,
    loading: resumeLoading,
    error,
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
  const [resumesPage, setResumesPage] = useState(1);

  // Get remaining generations
  const remainingGenerations = getRemainingAIGenerations();

  // Calculate percentage for progress bar
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;
  const generationsPercentage = generationsLimit > 0
    ? Math.max(0, Math.min(100, (remainingGenerations / generationsLimit) * 100))
    : 0;

  useEffect(() => {
    if (user) {
      fetchUserResumes();
    }
  }, [user, fetchUserResumes]); // Added fetchUserResumes

  const handleDeleteResume = async (id) => {
    if (window.confirm('Are you sure you want to delete this resume? This action cannot be undone.')) {
      try {
        await deleteResume(id);
        // Refresh the list of resumes after deletion
        await fetchUserResumes();
        toast.success('Resume deleted successfully');
      } catch { // _error was unused
        toast.error('Failed to delete resume');
      }
    }
  };

  const handleEditResume = (id) => {
    navigate(`/builder/${id}`);
  };

  const isDashboardLoading = resumeLoading || subscriptionLoading;
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
        ? `Target role: ${latestResumeTargetRole || 'set'}`
        : 'Add a job title you are applying for',
    },
    {
      done: canUseAiTailoring,
      label: isPremium
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
    navigate('/signin');
    return null;
  }

  return (
    <motion.div
      className="app-page max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnimatedElement variants={fadeInUp}>
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 md:p-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {nextAction.badge}
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100 md:text-3xl">
              {nextAction.title}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-gray-600 dark:text-slate-400">
              {nextAction.description}
            </p>

            {(nextAction.primaryAction || nextAction.secondaryAction) && (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {renderActionButton(nextAction.primaryAction, 'primary', 'w-full sm:w-auto')}
                {nextAction.secondaryAction && renderActionButton(nextAction.secondaryAction, 'outline', 'w-full sm:w-auto')}
              </div>
            )}

            {!isDashboardLoading && resumes.length > 0 && (
              <ul className="mt-6 space-y-2 border-t border-gray-100 pt-5 dark:border-slate-700">
                {checklistItems.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                        item.done
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}
                      aria-hidden="true"
                    >
                      {item.done ? '✓' : '·'}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </AnimatedElement>

      {/* AI Generation Limit Card - Only show for premium users */}
      {isPremium && !subscriptionLoading && (
        <AnimatedElement variants={fadeInUp} delay={0.2}>
          <motion.div
            className="mb-8 bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 overflow-hidden transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">AI Generation Limit</h2>
                <motion.button
                  onClick={refreshSubscriptionStatus}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Refresh
                </motion.button>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700 dark:text-slate-300">Monthly AI Generations</span>
                  <motion.span
                    className="font-medium"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    {remainingGenerations} / {generationsLimit} remaining
                  </motion.span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
                  <motion.div
                    className={`h-2.5 rounded-full ${remainingGenerations === 0 ? 'bg-red-500' :
                      remainingGenerations < 5 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${generationsPercentage}%` }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  ></motion.div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <motion.p
                  className="text-sm text-gray-600 dark:text-slate-400"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  {remainingGenerations === 0 ? (
                    <span className="text-red-600">You've reached your monthly limit</span>
                  ) : remainingGenerations < 5 ? (
                    <span className="text-yellow-600">You're running low on AI generations</span>
                  ) : (
                    <span>Use the AI Generator to create tailored resumes</span>
                  )}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  whileHover={{ scale: remainingGenerations === 0 ? 1 : 1.05 }}
                  whileTap={{ scale: remainingGenerations === 0 ? 1 : 0.95 }}
                >
                  <TouchLink
                    to="/ai-generator"
                    className={`${remainingGenerations === 0
                      ? "border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 opacity-50 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                      } rounded-lg text-base font-medium`}
                    ariaLabel={remainingGenerations === 0 ? "AI generation limit reached" : "Use AI Generator"}
                    disabled={remainingGenerations === 0}
                  >
                    {remainingGenerations === 0 ? "Limit Reached" : "Use AI Generator"}
                  </TouchLink>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatedElement>
      )}

      {resumeLoading ? (
        <motion.div
          className="app-loading-viewport"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          ></motion.div>
        </motion.div>
      ) : error ? (
        <AnimatedElement variants={fadeInUp}>
          <motion.div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {error}
          </motion.div>
        </AnimatedElement>
      ) : resumes.length === 0 ? (
        <AnimatedElement variants={scaleIn}>
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">No resumes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-slate-400">
              We&apos;ll help you pick the easiest way to start — no technical knowledge needed.
            </p>
            <div className="mt-6">
              <Button as="link" to="/new" animate={false} className="mx-auto">
                Create my first resume
              </Button>
            </div>
          </div>
        </AnimatedElement>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Your working resumes</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Keep one clean base for each direction you apply in. Open the latest card to edit, export, or retarget it.
              </p>
            </div>
            <Button as="link" to="/new" animate={false}>
              New resume
            </Button>
          </div>

          <StaggeredContainer
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            staggerDelay={0.1}
            initialDelay={0.2}
          >
            {paginatedResumes.map((resume) => (
              <StaggeredItem key={resume.id}>
                <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                  <div className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-3">
                      <h2 className="text-xl font-semibold truncate max-w-[80%]">
                        {(resume.personalInfo?.fullName || resume.title || 'Untitled Resume')}
                      </h2>
                      <div className="flex items-center">
                        <motion.button
                          className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleDeleteResume(resume.id)}
                          aria-label="Delete resume"
                          title="Delete resume"
                          whileHover={{ scale: 1.2, rotate: 10 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </motion.button>
                      </div>
                    </div>

                    <div className="mb-4 flex-grow">
                      <div className="flex items-center text-gray-600 dark:text-slate-400 mb-1">
                        <motion.svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          whileHover={{ scale: 1.2, color: "#3b82f6" }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </motion.svg>
                        <span className="text-sm line-clamp-1">
                          {getResumeDisplayJobTitle(resume) || 'Add a target job title'}
                        </span>
                      </div>

                      <div className="flex items-center text-gray-500 dark:text-slate-500 text-xs">
                        <motion.svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          whileHover={{ scale: 1.2, color: "#3b82f6" }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </motion.svg>
                        <span>
                          {resume.updatedAt ?
                            `Updated ${format(new Date(resume.updatedAt), 'MMM d, yyyy')}` :
                            'Recently updated'
                          }
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      className="flex w-full items-center justify-center"
                      onClick={() => handleEditResume(resume.id)}
                      animate={false}
                    >
                      Open resume
                    </Button>
                  </div>
                </div>
              </StaggeredItem>
            ))}
          </StaggeredContainer>
          <Pagination
            currentPage={resumesPage}
            totalPages={resumesTotalPages}
            onPageChange={setResumesPage}
            totalItems={resumes.length}
            pageSize={RESUMES_PER_PAGE}
            itemLabel="resumes"
            className="mt-4 rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          />
        </>
      )}

      {/* Premium Features Promotion - Only show for non-premium users */}
      {resumes.length > 0 && !isPremium && !subscriptionLoading && (
        <AnimatedElement variants={fadeInUp} delay={0.3}>
          <motion.div
            className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-8 transition-shadow duration-200 ease-out hover:shadow-xl will-change-transform"
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div className="flex flex-col md:flex-row items-center md:items-stretch">
              <div className="md:w-3/5 mb-6 md:mb-0 md:pr-8">
                <motion.h2
                  className="text-2xl font-bold mb-4"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  Upgrade to Premium
                </motion.h2>
                <motion.p
                  className="text-gray-700 dark:text-slate-300 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  Get access to our AI Resume Generator and create industry-tailored resumes with just a few clicks.
                  Our AI analyzes thousands of successful resumes to suggest the best content for your field.
                </motion.p>
                <StaggeredContainer className="space-y-2 mb-6" staggerDelay={0.1}>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>AI Resume Generator that creates tailored content</span>
                    </li>
                  </StaggeredItem>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>Advanced formatting options with more templates</span>
                    </li>
                  </StaggeredItem>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>Unlimited resume storage</span>
                    </li>
                  </StaggeredItem>
                </StaggeredContainer>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <TouchLink
                    to="/pricing"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium"
                    ariaLabel="Upgrade to premium plan"
                  >
                    Upgrade Now - $9.99/month
                  </TouchLink>
                </motion.div>
              </div>
              <motion.div
                className="md:w-2/5 flex justify-center"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <motion.img
                  src="/resume-illustration.svg"
                  alt="AI Resume Generator"
                  className="w-full max-w-sm md:max-w-md mx-auto"
                  whileHover={{ scale: 1.05, rotate: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                />
              </motion.div>
            </div>
          </motion.div>
        </AnimatedElement>
      )}
    </motion.div>
  );
};

export default Dashboard;
