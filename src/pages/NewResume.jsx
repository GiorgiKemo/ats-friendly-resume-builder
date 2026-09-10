import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useResume, initialResumeState } from '../context/ResumeContext';
import Button from '../components/ui/Button';

const NewResume = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const { updateCurrentResume, createResume } = useResume();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');
  const [creationTakingLong, setCreationTakingLong] = useState(false);
  const creationRef = useRef(false);
  const creationStatusTimerRef = useRef(null);
  const lifecycleRef = useRef(0);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    creationRef.current = false;
    setCreating(false);
    setCreationError('');
    setCreationTakingLong(false);
    if (creationStatusTimerRef.current) {
      clearTimeout(creationStatusTimerRef.current);
      creationStatusTimerRef.current = null;
    }
    return () => { lifecycleRef.current += 1; };
  }, [user?.id]);

  useEffect(() => () => {
    if (creationStatusTimerRef.current) clearTimeout(creationStatusTimerRef.current);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signup', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleStartEditor = async () => {
    if (creationRef.current || authLoading || !user?.id) return;
    const lifecycle = lifecycleRef.current;
    const userId = user.id;
    const isCurrent = () => lifecycleRef.current === lifecycle && userIdRef.current === userId;
    creationRef.current = true;
    setCreating(true);
    setCreationError('');
    setCreationTakingLong(false);
    creationStatusTimerRef.current = setTimeout(() => {
      if (isCurrent()) setCreationTakingLong(true);
    }, 8000);
    try {
      updateCurrentResume(initialResumeState, false);
      const newResume = await createResume();
      if (!isCurrent()) return;
      if (newResume?.id) {
        navigate(`/builder/${newResume.id}`);
        return;
      }
      const message = 'Could not create a resume. Please try again.';
      setCreationError(message);
      toast.error(message);
    } catch (error) {
      if (isCurrent()) {
        const message = error?.code === 'FREE_RESUME_LIMIT'
          ? error.message
          : 'Something went wrong while opening the editor. Please try again.';
        setCreationError(message);
        toast.error(message);
      }
    } finally {
      if (creationStatusTimerRef.current) {
        clearTimeout(creationStatusTimerRef.current);
        creationStatusTimerRef.current = null;
      }
      if (isCurrent()) {
        creationRef.current = false;
        setCreating(false);
        setCreationTakingLong(false);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="app-loading-viewport">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const loading = subscriptionLoading;

  return (
    <div className="app-page max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 md:text-3xl">
          How do you want to start?
        </h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">
          Pick the option that matches what you have right now. You can always switch later.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          disabled={creating}
          onClick={handleStartEditor}
          className="group rounded-2xl border-2 border-blue-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:bg-slate-800 dark:hover:border-blue-600"
        >
          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            Free · Recommended
          </span>
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100">
            Fill in my details step by step
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
            Best if you want a simple editor: add your work history, education, and skills at your own pace.
          </p>
          <p className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">
            {creating ? 'Opening editor…' : 'Start free editor →'}
          </p>
        </button>

        <button
          type="button"
          disabled={creating}
          onClick={() => navigate('/quick-resume')}
          className="group rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
        >
          <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            {isPremium ? 'Premium' : 'Premium feature'}
          </span>
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100">
            I have a job posting to paste
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
            Paste the job description and we&apos;ll help build a resume aimed at that role.
          </p>
          <p className="mt-4 text-sm font-medium text-gray-700 dark:text-slate-300">
            {isPremium ? 'Continue →' : 'See what’s included →'}
          </p>
        </button>
      </div>

      {(creationTakingLong || creationError) && (
        <div
          className={`mt-6 rounded-xl border px-4 py-3 text-sm ${creationError
            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200'
            : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200'}`}
          role={creationError ? 'alert' : 'status'}
          aria-live="polite"
        >
          <p className="font-semibold">{creationError ? 'Resume creation needs attention' : 'Still connecting…'}</p>
          <p className="mt-1">
            {creationError || 'The editor is taking longer than usual to open. Keep this tab open; you can try again if it does not finish.'}
          </p>
        </div>
      )}

      {!isPremium && !loading && (
        <p className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          The step-by-step editor is <strong className="font-medium text-gray-800 dark:text-slate-200">free</strong>.
          {' '}
          Pasting a job posting uses Premium AI tools.
          {' '}
          <Link
            to="/pricing"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            View plans
          </Link>
        </p>
      )}

      <div className="mt-8 text-center">
        <Button as="link" to="/dashboard" variant="ghost" className="text-gray-600 dark:text-slate-400">
          ← Back to my resumes
        </Button>
      </div>
    </div>
  );
};

export default NewResume;
