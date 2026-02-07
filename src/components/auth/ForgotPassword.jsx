import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import Input from '../ui/Input';
import Button from '../ui/Button';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            // Call Supabase function to send password reset email
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`, // Replace with your actual update password page
            });

            if (error) {
                setMessage(error.message);
            } else {
                setMessage('Password reset link sent to your email address.');
            }
        } catch { // Ensure this is an empty catch if _err is truly unused
            setMessage('An error occurred. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Forgot Password</h2>
            {message && <div className="mb-4 text-green-500">{message}</div>}
            <form onSubmit={handleSubmit}>
                <Input
                    label="Email"
                    type="email"
                    id="email"
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
