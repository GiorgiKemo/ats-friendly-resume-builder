import React, { useEffect } from 'react'; // Removed useState
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import { TouchLink, Button } from '../components/ui'; // Removed TouchButton
import toast from 'react-hot-toast';
import { format } from 'date-fns';
// import { supabase } from '../services/supabase'; // Removed unused supabase
import { motion } from 'framer-motion';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp, fadeInLeft, fadeInRight, scaleIn } from '../utils/animationVariants'; // Removed fadeIn

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const {
    resumes,
    loading: resumeLoading,
    error,
    fetchUserResumes,
    deleteResume,
    updateCurrentResume,
    createResume, // Add createResume
    initialResumeState // Add initialResumeState
  } = useResume();
  const {
    isPremium,
    loading: subscriptionLoading,
    subscriptionData,
    getRemainingAIGenerations,
    refreshSubscriptionStatus
  } = useSubscription();
  const navigate = useNavigate();

  // Get remaining generations
  const remainingGenerations = getRemainingAIGenerations();

  // Calculate percentage for progress bar
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;
  const generationsUsed = subscriptionData?.aiGenerationsUsed || 0;
  const generationsPercentage = generationsLimit > 0
    ? Math.max(0, Math.min(100, (generationsUsed / generationsLimit) * 100))
    : 0;

  useEffect(() => {
    if (user) {
      fetchUserResumes();
    }
  }, [user, fetchUserResumes]); // Added fetchUserResumes

  const handleDeleteResume = async (id) => {
    if (window.confirm('Are you sure you want to delete this resume? This action cannot be undone.')) {
      try {
        await deleteResume(id);
        // Refresh the list of resumes after deletion
        await fetchUserResumes();
        toast.success('Resume deleted successfully');
      } catch { // _error was unused
        toast.error('Failed to delete resume');
      }
    }
  };

  const handleCreateNew = async () => {
    try {
      // Set current resume to initial state locally first for responsiveness
      updateCurrentResume(initialResumeState, false); // Don't autosave this temporary state

      // Create a new resume in the backend
      const newResume = await createResume(); // Uses initialResumeState by default

      if (newResume && newResume.id) {
        // Update the context with the actual new resume data from backend
        updateCurrentResume(newResume, false); // Don't autosave immediately
        navigate(`/builder/${newResume.id}`);
      } else {
        toast.error('Failed to create a new resume. Please try again.');
        // Optionally, revert currentResume if needed or fetch fresh list
        fetchUserResumes();
      }
    } catch (err) {
      toast.error('An error occurred while creating the resume.');
      console.error("Create new resume error:", err);
    }
  };

  const handleEditResume = (id) => {
    navigate(`/builder/${id}`);
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    navigate('/signin');
    return null;
  }

  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <AnimatedElement variants={fadeInLeft}>
          <h1 className="text-3xl font-bold">My Resumes</h1>
          <p className="text-gray-600 mt-1">Manage and create your ATS-optimized resumes</p>
        </AnimatedElement>
        <AnimatedElement variants={fadeInRight}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button onClick={handleCreateNew} className="w-full md:w-auto" animate={false}>
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create New Resume
              </span>
            </Button>
          </motion.div>
        </AnimatedElement>
      </div>

      {/* AI Generation Limit Card - Only show for premium users */}
      {isPremium && !subscriptionLoading && (
        <AnimatedElement variants={fadeInUp} delay={0.2}>
          <motion.div
            className="mb-8 bg-white rounded-lg shadow-md overflow-hidden"
            whileHover={{
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              y: -5
            }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">AI Generation Limit</h2>
                <motion.button
                  onClick={refreshSubscriptionStatus}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Refresh
                </motion.button>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Monthly AI Generations</span>
                  <motion.span
                    className="font-medium"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    {remainingGenerations} / {generationsLimit} remaining
                  </motion.span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <motion.div
                    className={`h-2.5 rounded-full ${remainingGenerations === 0 ? 'bg-red-500' :
                      remainingGenerations < 5 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${generationsPercentage}%` }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  ></motion.div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <motion.p
                  className="text-sm text-gray-600"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  {remainingGenerations === 0 ? (
                    <span className="text-red-600">You've reached your monthly limit</span>
                  ) : remainingGenerations < 5 ? (
                    <span className="text-yellow-600">You're running low on AI generations</span>
                  ) : (
                    <span>Use the AI Generator to create tailored resumes</span>
                  )}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  whileHover={{ scale: remainingGenerations === 0 ? 1 : 1.05 }}
                  whileTap={{ scale: remainingGenerations === 0 ? 1 : 0.95 }}
                >
                  <TouchLink
                    to="/ai-generator"
                    className={`${remainingGenerations === 0
                      ? "border border-gray-300 bg-white text-gray-700 opacity-50 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                      } rounded-lg text-base font-medium`}
                    ariaLabel={remainingGenerations === 0 ? "AI generation limit reached" : "Use AI Generator"}
                    {...(remainingGenerations === 0 ? { 'aria-disabled': 'true' } : {})}
                  >
                    {remainingGenerations === 0 ? "Limit Reached" : "Use AI Generator"}
                  </TouchLink>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatedElement>
      )}

      {resumeLoading ? (
        <motion.div
          className="flex justify-center items-center h-64"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          ></motion.div>
        </motion.div>
      ) : error ? (
        <AnimatedElement variants={fadeInUp}>
          <motion.div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {error}
          </motion.div>
        </AnimatedElement>
      ) : resumes.length === 0 ? (
        <AnimatedElement variants={scaleIn}>
          <motion.div
            className="bg-white rounded-lg shadow-md p-8 text-center"
            whileHover={{ boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" }}
            transition={{ duration: 0.3 }}
          >
            <motion.h2
              className="text-xl font-semibold mb-4"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              You don't have any resumes yet
            </motion.h2>
            <motion.p
              className="text-gray-600 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              Create your first ATS-optimized resume to get started on your job search journey.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button onClick={handleCreateNew} animate={false}>Create Your First Resume</Button>
            </motion.div>
          </motion.div>
        </AnimatedElement>
      ) : (
        <StaggeredContainer
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          staggerDelay={0.1}
          initialDelay={0.2}
        >
          {resumes.map((resume) => (
            <StaggeredItem key={resume.id}>
              <motion.div
                className="bg-white rounded-lg shadow-md overflow-hidden h-full"
                whileHover={{
                  y: -10,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <div className="p-6 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-xl font-semibold truncate max-w-[80%]">
                      {(resume.personalInfo?.fullName || resume.personal_info?.fullName || resume.title || 'Untitled Resume')}
                    </h2>
                    <div className="flex items-center">
                      <motion.button
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50"
                        onClick={() => handleDeleteResume(resume.id)}
                        aria-label="Delete resume"
                        title="Delete resume"
                        whileHover={{ scale: 1.2, rotate: 10 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </motion.button>
                    </div>
                  </div>

                  <div className="mb-4 flex-grow">
                    <div className="flex items-center text-gray-600 mb-1">
                      <motion.svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        whileHover={{ scale: 1.2, color: "#3b82f6" }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </motion.svg>
                      <span className="text-sm line-clamp-1">
                        {(resume.personalInfo?.jobTitle || resume.personal_info?.jobTitle || 'No job title specified')}
                      </span>
                    </div>

                    <div className="flex items-center text-gray-500 text-xs">
                      <motion.svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        whileHover={{ scale: 1.2, color: "#3b82f6" }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </motion.svg>
                      <span>
                        {resume.updated_at ?
                          `Updated ${format(new Date(resume.updated_at), 'MMM d, yyyy')}` :
                          'Recently updated'
                        }
                      </span>
                    </div>
                  </div>

                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      variant="primary"
                      className="w-full flex justify-center items-center"
                      onClick={() => handleEditResume(resume.id)}
                      animate={false}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Resume
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            </StaggeredItem>
          ))}
        </StaggeredContainer>
      )}

      {/* Premium Features Promotion - Only show for non-premium users */}
      {resumes.length > 0 && !isPremium && !subscriptionLoading && (
        <AnimatedElement variants={fadeInUp} delay={0.3}>
          <motion.div
            className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8"
            whileHover={{
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              y: -5
            }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex flex-col md:flex-row items-center">
              <div className="md:w-2/3 mb-6 md:mb-0 md:pr-8">
                <motion.h2
                  className="text-2xl font-bold mb-4"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  Upgrade to Premium
                </motion.h2>
                <motion.p
                  className="text-gray-700 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  Get access to our AI Resume Generator and create industry-tailored resumes with just a few clicks.
                  Our AI analyzes thousands of successful resumes to suggest the best content for your field.
                </motion.p>
                <StaggeredContainer className="space-y-2 mb-6" staggerDelay={0.1}>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>AI Resume Generator that creates tailored content</span>
                    </li>
                  </StaggeredItem>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>Advanced formatting options with more templates</span>
                    </li>
                  </StaggeredItem>
                  <StaggeredItem>
                    <li className="flex items-center">
                      <motion.svg
                        className="h-5 w-5 text-green-500 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        whileHover={{ scale: 1.2, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      <span>Unlimited resume storage</span>
                    </li>
                  </StaggeredItem>
                </StaggeredContainer>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <TouchLink
                    to="/pricing"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium"
                    ariaLabel="Upgrade to premium plan"
                  >
                    Upgrade Now - $9.99/month
                  </TouchLink>
                </motion.div>
              </div>
              <motion.div
                className="md:w-1/3"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <motion.img
                  src="/resume-illustration.svg"
                  alt="AI Resume Generator"
                  className="w-full max-w-xs mx-auto"
                  whileHover={{ scale: 1.05, rotate: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                />
              </motion.div>
            </div>
          </motion.div>
        </AnimatedElement>
      )}
    </motion.div>
  );
};

export default Dashboard;
