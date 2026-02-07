import React from 'react';
import AIResumeGenerator from '../components/resume/AIResumeGenerator';
import { motion } from 'framer-motion';
// import { fadeIn, fadeInUp } from '../utils/animationVariants'; // Unused imports

const AIGeneratorPage = () => {
  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-4xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 15,
          delay: 0.4
        }}
      >
        <AIResumeGenerator />
      </motion.div>
    </motion.div>
  );
};

export default AIGeneratorPage;
