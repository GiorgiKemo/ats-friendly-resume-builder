import React from 'react';
import { Navigate } from 'react-router-dom';
import SignIn from '../components/auth/SignIn';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { fadeInUp } from '../utils/animationVariants';

const SignInPage = () => {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <motion.div
      className="container mx-auto px-4 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.h1
        className="text-3xl font-bold text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Sign In
      </motion.h1>
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <SignIn />
      </motion.div>
    </motion.div>
  );
};

export default SignInPage;
