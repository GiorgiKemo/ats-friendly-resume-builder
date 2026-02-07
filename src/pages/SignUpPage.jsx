import React from 'react';
import SignUp from '../components/auth/SignUp';
import { motion } from 'framer-motion';
import { fadeInUp } from '../utils/animationVariants';

const SignUpPage = () => {
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
        Create an Account
      </motion.h1>
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <SignUp />
      </motion.div>
    </motion.div>
  );
};

export default SignUpPage;
