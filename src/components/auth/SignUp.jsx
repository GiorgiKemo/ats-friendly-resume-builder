import React, { useState } from 'react'; // Removed useEffect
import { Link } from 'react-router-dom'; // Removed useNavigate
import { useAuth } from '../../context/AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TouchButton from '../ui/TouchButton';
import MobileFormField from '../ui/MobileFormField';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../../utils/animationVariants';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmationMessage, setShowConfirmationMessage] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const { signUp } = useAuth();
  // const navigate = useNavigate(); // Removed unused navigate

  const validateForm = () => {
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setLoading(true);
      setError('');

      const { data, error: signUpError } = await signUp(email, password);

      console.log('[SignUp.jsx] Response from AuthContext signUp:', { data, signUpError }); // <-- ADD THIS LOG

      if (signUpError) {
        throw signUpError;
      }

      // If signUpError is null, Supabase has processed the request,
      // and an email has been sent (either initial or a re-send).
      // This is the point where we should show the success UI.
      setSubmittedEmail(email);
      setShowConfirmationMessage(true);
      toast.success('Registration successful! Please check your email for a confirmation link to activate your account.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      // Optional: Log for debugging if data.user was null, but don't show an error toast to the user.
      if (!(data && data.user)) {
        console.log('[SignUp.jsx] Info: Supabase signUp call was successful (no error), but data.user is not present. This might be a re-send of a confirmation email or a new user awaiting confirmation. Data:', data);
      }
    } catch (error) {
      console.error('Detailed Supabase sign-up error:', error);
      let errorMessage = 'Failed to create account. Please try again.';
      if (error.message) {
        if (error.message.toLowerCase().includes('user already registered') || error.message.toLowerCase().includes('email rate limit exceeded')) {
          errorMessage = 'This email is already registered or an account was recently created with it.';
        } else if (error.message.toLowerCase().includes('password should be at least 6 characters') || error.message.toLowerCase().includes('weak password')) {
          errorMessage = 'Password is too weak. Please use at least 6 characters.';
        } else if (error.message.toLowerCase().includes('validation failed')) {
          errorMessage = 'Please ensure all fields are correctly filled.';
        } else {
          errorMessage = error.message;
        }
      }
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // const [isMobile, setIsMobile] = useState(false); // Removed unused isMobile state
  // useEffect for isMobile was removed.

  return (
    <motion.div
      className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" }}
    >
      {showConfirmationMessage ? (
        <motion.div
          className="text-center p-6 bg-green-50 border border-green-300 text-green-700 rounded-lg shadow-sm"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <svg className="w-16 h-16 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <h2 className="text-2xl font-semibold mb-3">Registration Successful!</h2>
          <p className="text-md mb-4">
            A confirmation email has been sent to <strong>{submittedEmail}</strong>.
            Please click the link in it to activate your account.
          </p>
          <p className="text-sm text-gray-600 mb-6">
            If you don't see the email, please check your spam folder.
          </p>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <Link
              to="/signin"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
            >
              Go to Sign In
            </Link>
          </motion.div>
        </motion.div>
      ) : (
        <>
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
                  name="email"
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
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  tooltip="Password must be at least 6 characters"
                />
                <PasswordStrengthIndicator password={password} />
              </motion.div>

              <motion.div variants={staggerItem}>
                <Input
                  label="Confirm Password"
                  id="confirmPassword-desktop"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  error={error}
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
                  {loading ? 'Creating Account...' : 'Sign Up'}
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
                <div className="mb-1">
                  <MobileFormField
                    label="Password"
                    id="password-mobile"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <PasswordStrengthIndicator password={password} />
                  <motion.p
                    className="text-xs text-gray-500 mt-1 ml-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Password must be at least 6 characters
                  </motion.p>
                </div>
              </motion.div>

              <motion.div variants={staggerItem}>
                <MobileFormField
                  label="Confirm Password"
                  id="confirmPassword-mobile"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  error={error}
                  autoComplete="new-password"
                />
              </motion.div>

              <motion.div
                variants={staggerItem}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <TouchButton
                  type="submit"
                  className="w-full mt-6"
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Sign Up'}
                </TouchButton>
              </motion.div>
            </motion.div>
          </form>

          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <motion.span
                whileHover={{ scale: 1.05 }}
                className="inline-block"
              >
                <Link to="/signin" className="text-blue-600 hover:underline font-medium">
                  Sign in
                </Link>
              </motion.span>
            </p>
          </motion.div>
        </>
      )}
    </motion.div>
  );
};

export default SignUp;
