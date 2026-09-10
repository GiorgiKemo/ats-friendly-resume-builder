import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import Input from '../ui/Input';
import Button from '../ui/Button';
import PageHero from '../ui/PageHero';
import { useAuth } from '../../context/AuthContext';

const ForgotPassword = () => {
    const { user, loading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);
    const pendingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    if (!authLoading && user) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pendingRef.current) return;
        pendingRef.current = true;
        setLoading(true);
        setMessage('');
        setFailed(false);

        try {
            const normalizedEmail = email.trim();
            const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: window.location.origin,
            });
            if (!mountedRef.current) return;

            if (error) {
                setFailed(true);
                setMessage(error.message);
            } else {
                setMessage('If an account uses this email, a password reset link has been requested. Check your inbox and spam folder.');
            }
        } catch { // Ensure this is an empty catch if _err is truly unused
            if (!mountedRef.current) return;
            setFailed(true);
            setMessage('An error occurred. Please try again later.');
        } finally {
            pendingRef.current = false;
            if (mountedRef.current) setLoading(false);
        }
    };

    return (
        <div>
            <PageHero
                eyebrow="Reset access"
                align="center"
                title="Forgot Password"
                lead="Request a secure reset link without revealing whether an account uses this email."
                titleId="forgot-password-title"
            />
            <div className="app-page max-w-md">
                <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40 sm:p-8">
                    {message && <div role={failed ? 'alert' : 'status'} className={`mb-4 text-sm ${failed ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{message}</div>}
                    <form onSubmit={handleSubmit}>
                        <Input
                            label="Email"
                            type="email"
                            id="email"
                            autoComplete="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Button type="submit" disabled={loading} className="w-full mt-4">
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </Button>
                    </form>
                    <div className="mt-4 text-sm">
                        Remember your password?{' '}
                        <Link to="/signin" className="text-blue-600 underline hover:no-underline dark:text-blue-300 dark:hover:text-blue-200">
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
