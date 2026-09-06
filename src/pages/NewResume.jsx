import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const creationRef = useRef(false);
  const lifecycleRef = useRef(0);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    creationRef.current = false;
    setCreating(false);
    return () => { lifecycleRef.current += 1; };
  }, [user?.id]);

  const handleStartEditor = async () => {
    if (creationRef.current || authLoading || subscriptionLoading || !user?.id) return;
    const lifecycle = lifecycleRef.current;
    const userId = user.id;
    const isCurrent = () => lifecycleRef.current === lifecycle && userIdRef.current === userId;
    creationRef.current = true;
    setCreating(true);
    try {
      updateCurrentResume(initialResumeState, false);
      const newResume = await createResume();
      if (!isCurrent()) return;
      if (newResume?.id) {
        navigate(`/builder/${newResume.id}`);
        return;
      }
      toast.error('Could not create a resume. Please try again.');
    } catch {
      if (isCurrent()) toast.error('Something went wrong. Please try again.');
    } finally {
      if (isCurrent()) {
        creationRef.current = false;
        setCreating(false);
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
    navigate('/signup');
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
          disabled={loading || creating}
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
          disabled={loading || creating}
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

      {!isPremium && !loading && (
        <p className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          The step-by-step editor is <strong className="font-medium text-gray-800 dark:text-slate-200">free</strong>.
          {' '}
          Pasting a job posting uses Premium AI tools.
          {' '}
          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            View plans
          </button>
        </p>
      )}

      <div className="mt-8 text-center">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-gray-600 dark:text-slate-400">
          ← Back to my resumes
        </Button>
      </div>
    </div>
  );
};

export default NewResume;
