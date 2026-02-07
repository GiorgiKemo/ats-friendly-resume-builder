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
      console.error('Sign in error:', error);

      // Handle specific error cases
      if (error.message?.includes('Invalid login credentials')) {
        toast.error('Invalid email or password. Please try again.');
      } else if (error.message?.includes('Email not confirmed')) {
        toast.custom((t) => (
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-xl border border-amber-200 bg-white shadow-lg ${
              t.visible ? 'animate-enter' : 'animate-leave'
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-semibold">
                !
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Email verification required</p>
                <p className="mt-1 text-sm text-gray-600">
                  Your email is not confirmed. Please check your inbox for the verification link.
                </p>
                {isLocalhost && (
                  <p className="mt-2 text-xs text-amber-700">
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
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
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
      className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" }}
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
        <p className="text-sm text-gray-600">
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
