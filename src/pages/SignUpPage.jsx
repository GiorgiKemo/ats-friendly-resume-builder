import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignUp from '../components/auth/SignUp';
import { useAuth } from '../context/AuthContext';
import { PageHero } from '../components/ui';
import { fadeInUp } from '../utils/animationVariants';

const SignUpPage = () => {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHero
        eyebrow="Get started for free"
        align="center"
        title="Create your ResumeATS account"
        lead="Build an ATS-friendly resume in minutes — no credit card required. Upgrade any time for AI-powered tailoring."
        titleId="signup-page-title"
      />

      <motion.div
        className="app-page max-w-md"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <SignUp />
      </motion.div>
    </div>
  );
};

export default SignUpPage;
