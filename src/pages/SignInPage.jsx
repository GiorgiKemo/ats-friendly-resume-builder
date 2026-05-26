import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignIn from '../components/auth/SignIn';
import { useAuth } from '../context/AuthContext';
import { PageHero } from '../components/ui';
import { fadeInUp } from '../utils/animationVariants';

const SignInPage = () => {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHero
        eyebrow="Welcome back"
        align="center"
        title="Sign in to ResumeATS"
        lead="Pick up where you left off — your resumes, applications, and AI quota are waiting."
        titleId="signin-page-title"
      />

      <motion.div
        className="app-page max-w-md"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <SignIn />
      </motion.div>
    </div>
  );
};

export default SignInPage;
