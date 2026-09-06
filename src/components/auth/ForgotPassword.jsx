import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import Input from '../ui/Input';
import Button from '../ui/Button';

const ForgotPassword = () => {
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pendingRef.current) return;
        pendingRef.current = true;
        setLoading(true);
        setMessage('');
        setFailed(false);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
        <div className="max-w-md mx-auto p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30">
            <h1 className="text-2xl font-semibold mb-4">Forgot Password</h1>
            {message && <div role={failed ? 'alert' : 'status'} className={`mb-4 text-sm ${failed ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{message}</div>}
            <form onSubmit={handleSubmit}>
                <Input
                    label="Email"
                    type="email"
                    id="email"
                    autoComplete="email"
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
                <Link to="/signin" className="text-blue-600 hover:underline">
                    Sign in
                </Link>
            </div>
        </div>
    );
};

export default ForgotPassword;
