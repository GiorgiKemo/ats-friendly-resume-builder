import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const AuthCallbackPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resendVerificationEmail } = useAuth(); // Assuming this exists from previous steps

    const [errorMessage, setErrorMessage] = useState('');
    const [showResendForm, setShowResendForm] = useState(false);
    const [emailForResend, setEmailForResend] = useState('');
    const [isResending, setIsResending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const errorDescription = params.get('error_description');
        const error = params.get('error'); // General error code

        if (errorDescription) {
            if (errorDescription.toLowerCase().includes('link is invalid or has expired')) {
                setErrorMessage('Your verification link is invalid or has expired. Please request a new one.');
                setShowResendForm(true);
            } else if (errorDescription.toLowerCase().includes('user not found')) {
                setErrorMessage('This email address is not associated with an account. Please sign up.');
                // Optionally redirect to signup or show signup link
            } else {
                setErrorMessage(`An error occurred: ${errorDescription}`);
                // Potentially offer a generic resend or redirect to signin
                setShowResendForm(true); // Offer resend for other errors too, just in case
            }
        } else if (error) {
            // Handle other generic errors if needed, e.g. from OAuth
            setErrorMessage(`An authentication error occurred: ${error}. Please try again.`);
            // Potentially redirect to signin
        } else {
            // No error, likely a successful implicit auth flow (e.g. OAuth success, or already handled by onAuthStateChange)
            // For email link verification, onAuthStateChange usually handles the SIGNED_IN event.
            // If user lands here without error, it might be an unexpected state or already handled.
            // Redirecting to dashboard or sign-in as a fallback.
            toast.success('Verification successful or already processed!');
            navigate('/dashboard');
        }
        setIsLoading(false);
    }, [location, navigate]);

    const handleResendSubmit = async (e) => {
        e.preventDefault();
        if (!emailForResend) {
            toast.error('Please enter your email address.');
            return;
        }
        setIsResending(true);
        try {
            await resendVerificationEmail(emailForResend);
            toast.success(`A new verification email has been sent to ${emailForResend}. Please check your inbox.`);
            setShowResendForm(false); // Hide form after successful resend
            setErrorMessage('Verification email resent. Please check your inbox and try the new link.');
        } catch (err) {
            toast.error(err.message || 'Failed to resend verification email.');
        } finally {
            setIsResending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center w-full h-screen">
                <div className="w-16 h-16 border-t-4 border-b-4 border-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <motion.div
            className="container mx-auto px-4 py-16 flex flex-col items-center text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <motion.h1
                className="text-3xl font-bold text-red-600 mb-6"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
            >
                Verification Issue
            </motion.h1>

            {errorMessage && (
                <motion.p
                    className="text-lg text-gray-700 mb-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                >
                    {errorMessage}
                </motion.p>
            )}

            {showResendForm && (
                <motion.form
                    onSubmit={handleResendSubmit}
                    className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    <Input
                        label="Enter your email to resend verification:"
                        id="emailForResend"
                        type="email"
                        value={emailForResend}
                        onChange={(e) => setEmailForResend(e.target.value)}
                        required
                        placeholder="your@email.com"
                        className="mb-4"
                    />
                    <Button type="submit" className="w-full" disabled={isResending}>
                        {isResending ? 'Resending...' : 'Resend Verification Email'}
                    </Button>
                </motion.form>
            )}

            <motion.div
                className="mt-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
            >
                <Link to="/signin" className="text-indigo-600 hover:text-indigo-800 font-medium">
                    Go to Sign In page
                </Link>
            </motion.div>
        </motion.div>
    );
};

export default AuthCallbackPage;