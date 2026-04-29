import React, { useState } from 'react'; // Removed useEffect
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TouchButton from '../ui/TouchButton';
import MobileFormField from '../ui/MobileFormField';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../../utils/animationVariants';

const showInvalidLoginToast = () => {
  toast.custom((t) => (
    <div
      className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-red-200 bg-white shadow-xl shadow-slate-900/10 dark:border-red-500/30 dark:bg-slate-800 dark:shadow-slate-950/40 ${
        t.visible ? 'animate-enter' : 'animate-leave'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
          !
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sign in failed</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            The email or password does not match an active account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          aria-label="Dismiss sign in error"
        >
          Close
        </button>
      </div>
    </div>
  ), { duration: 6000 });
};

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, resendVerificationEmail } = useAuth(); // Import resendVerificationEmail
  const navigate = useNavigate();
  const [isResending, setIsResending] = useState(false); // For loading state of resend button
  // const [isMobile, setIsMobile] = useState(false); // Removed unused isMobile state
  const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Please enter your email address first.');
      return;
    }
    setIsResending(true);
    try {
      await resendVerificationEmail(email);
      toast.success(`A new verification email has been sent to ${email}. Please check your inbox.`);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      toast.error(error.message || 'Failed to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      await signIn(email, password);
      toast.success('Signed in successfully!');
      navigate('/dashboard');
    } catch (error) {
      const errorMessage = error.message || '';

      // Handle specific error cases
      if (errorMessage.includes('Invalid login credentials')) {
        showInvalidLoginToast();
      } else if (errorMessage.includes('Email not confirmed')) {
        toast.custom((t) => (
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-xl border border-amber-200 bg-white shadow-lg dark:border-amber-500/30 dark:bg-slate-800 dark:shadow-slate-950/40 ${
              t.visible ? 'animate-enter' : 'animate-leave'
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 flex items-center justify-center text-lg font-semibold">
                !
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Email verification required</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                  Your email is not confirmed. Please check your inbox for the verification link.
                </p>
                {isLocalhost && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Dev tip: disable “Confirm email” in your Supabase dev project only.
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      toast.dismiss(t.id);
                      handleResendVerification();
                    }}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                    disabled={isResending}
                  >
                    {isResending ? 'Resending...' : 'Resend Verification Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.dismiss(t.id)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-slate-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        ), {
          duration: 8000,
        });
      } else {
        console.error('Sign in error:', error);
        toast.error(error.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // useEffect for isMobile was removed as isMobile state is unused.
  // Responsive rendering is handled by Tailwind's md: prefixes.

  return (
    <motion.div
      className="max-w-md mx-auto p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -2 }}
    >
      <form onSubmit={handleSubmit}>
        {/* Desktop version */}
        <motion.div
          className="hidden md:block"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}>
            <Input
              label="Email"
              id="email-desktop"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </motion.div>

          <motion.div variants={staggerItem}>
            <Input
              label="Password"
              id="password-desktop"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </motion.div>

          <motion.div
            variants={staggerItem}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <Button
              type="submit"
              className="w-full mt-4"
              disabled={loading}
              animate={false}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </motion.div>
        </motion.div>

        {/* Mobile version */}
        <motion.div
          className="md:hidden"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}>
            <MobileFormField
              label="Email"
              id="email-mobile"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              autoComplete="email"
            />
          </motion.div>

          <motion.div variants={staggerItem}>
            <MobileFormField
              label="Password"
              id="password-mobile"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </motion.div>

          <motion.div
            variants={staggerItem}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <TouchButton
              type="submit"
              className="w-full mt-4"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </TouchButton>
          </motion.div>
        </motion.div>
      </form>

      <motion.div
        className="mt-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <p className="text-sm text-gray-600 dark:text-slate-400">
          <Link to="/forgot-password" className="text-blue-600 hover:underline font-medium block mb-2">
            Forgot Password?
          </Link>
          Don't have an account?{' '}
          <motion.span
            whileHover={{ scale: 1.05 }}
            className="inline-block"
          >
            <Link to="/signup" className="text-blue-600 hover:underline font-medium">
              Sign up
            </Link>
          </motion.span>
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SignIn;
