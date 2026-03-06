import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { TouchLink } from '../ui'; // Removed TouchButton
import { useAuth } from '../../context/AuthContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx'; // Import useResume and initialResumeState
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInLeft, fadeInRight } from '../../utils/animationVariants';

const HeroSection = () => {
  const { user } = useAuth();
  const { updateCurrentResume } = useResume(); // Get updateCurrentResume instead
  const navigate = useNavigate();

  const handleStartBuilding = (e) => {
    if (!user) {
      e.preventDefault();
      toast('Please sign in or create an account to start building your resume.', {
        icon: '📝',
      });
      navigate('/signin');
    } else {
      // User is logged in, reset resume state before navigating
      updateCurrentResume(initialResumeState, false); // Call updateCurrentResume, autosave false
      // Navigation will proceed via the TouchLink's `to` prop
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 py-16">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col md:flex-row items-center">
          <AnimatedElement
            className="md:w-1/2 mb-10 md:mb-0"
            variants={fadeInLeft}
          >
            <motion.h1
              className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
              initial={{ opacity: 0.8, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                willChange: 'transform',
                contentVisibility: 'auto',
                contain: 'layout'
              }}
            >
              Build an ATS-Optimized Resume That Gets You Noticed.
            </motion.h1>
            <motion.p
              className="text-lg text-gray-700 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              Craft a professional, recruiter-approved resume with our easy-to-use builder and expert-designed templates. Start for free and land more interviews.
            </motion.p>
            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <TouchLink
                to="/builder"
                onClick={handleStartBuilding}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-lg font-medium"
                ariaLabel="Start building your resume for free"
              >
                Start Building Free
              </TouchLink>
              <TouchLink
                to="/pricing"
                className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-lg font-medium"
                ariaLabel="Explore Premium AI resume tools"
              >
                Explore Premium AI Tools
              </TouchLink>
            </motion.div>
          </AnimatedElement>
          <AnimatedElement
            className="md:w-1/2 md:pl-10"
            variants={fadeInRight}
          >
            <motion.div
              className="w-full max-w-md mx-auto"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.3,
                delay: 0.1,
                ease: "easeOut",
                type: "tween"
              }}
            >
              {/* Optimized Image Loading for LCP */}
              <picture>
                <source
                  media="(max-width: 768px)"
                  srcSet="/resume-illustration-mobile.svg"
                  width="320"
                  height="240"
                />
                <img
                  src="/resume-illustration-desktop.svg"
                  alt="ResumeATS"
                  width="448"
                  height="336"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                  className="w-full"
                  style={{
                    contentVisibility: 'auto',
                    aspectRatio: '448/336'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/448x336?text=Resume+Builder';
                  }}
                />
              </picture>
            </motion.div>
          </AnimatedElement>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
