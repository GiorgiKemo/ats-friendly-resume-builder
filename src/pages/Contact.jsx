import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { fadeInLeft, fadeInRight } from '../utils/animationVariants'; // Removed unused fadeIn, fadeInUp, scaleIn
import { SUPPORT_ADDRESS_LINES, SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_URI } from '../config/supportInfo';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const mailtoSubject = encodeURIComponent(`[ResumeATS Contact] ${formData.subject}`);
      const mailtoBody = encodeURIComponent(
        `Name: ${formData.name}\nEmail: ${formData.email}\n\n${formData.message}`
      );
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${mailtoSubject}&body=${mailtoBody}`;

      toast.success(`Opening your email client. If it doesn't open, please email us directly at ${SUPPORT_EMAIL}`);
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
    } catch {
      toast.error(`Unable to open email client. Please email us directly at ${SUPPORT_EMAIL}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-12 max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <motion.h1
          className="text-4xl font-bold mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          Get in Touch with ResumeATS
        </motion.h1>
        <motion.p
          className="text-xl text-gray-600 dark:text-slate-400 max-w-3xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          We're dedicated to your success. Whether you have a question about our features, need help with your resume, or want to share feedback, please reach out. Our team aims to respond promptly.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid md:grid-cols-2 gap-12"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.2,
              delayChildren: 0.5
            }
          }
        }}
        initial="hidden"
        animate="visible"
      >
        {/* Contact Form */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-8 transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
          variants={fadeInLeft}
          whileHover={{ y: -4 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
        >
          <motion.h2
            className="text-2xl font-bold mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            Direct Message to Our Team
          </motion.h2>
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows="6"
                className="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                required
              ></textarea>
            </div>

            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                animate={false}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Your Inquiry'}
              </Button>
            </motion.div>
          </motion.form>
        </motion.div>

        {/* Contact Information */}
        <motion.div variants={fadeInRight}>
          <motion.div
            className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-8 mb-8 transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <motion.h2
              className="text-2xl font-bold mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Other Ways to Connect
            </motion.h2>
            <motion.div
              className="space-y-4"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1,
                    delayChildren: 0.7
                  }
                }
              }}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="flex items-start"
                variants={{
                  hidden: { opacity: 0, x: -20 },
                  visible: { opacity: 1, x: 0 }
                }}
              >
                <motion.div
                  className="flex-shrink-0 mt-1"
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </motion.div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold">General Inquiries & Support</h3>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gray-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300">
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </motion.div>
              <motion.div
                className="flex items-start"
                variants={{
                  hidden: { opacity: 0, x: -20 },
                  visible: { opacity: 1, x: 0 }
                }}
              >
                <motion.div
                  className="flex-shrink-0 mt-1"
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </motion.div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold">Phone Support (Premium Users)</h3>
                  <a href={`tel:${SUPPORT_PHONE_URI}`} className="text-gray-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300">
                    {SUPPORT_PHONE_DISPLAY}
                  </a>
                  <p className="text-gray-500 dark:text-slate-500 text-sm">Current support line for premium customers and billing help.</p>
                </div>
              </motion.div>
              <motion.div
                className="flex items-start"
                variants={{
                  hidden: { opacity: 0, x: -20 },
                  visible: { opacity: 1, x: 0 }
                }}
              >
                <motion.div
                  className="flex-shrink-0 mt-1"
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </motion.div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold">Our Headquarters</h3>
                  {SUPPORT_ADDRESS_LINES.map((line) => (
                    <p key={line} className="text-gray-600 dark:text-slate-400">{line}</p>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div
            className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-8 transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
            variants={fadeInRight}
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <motion.h2
              className="text-2xl font-bold mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Quick Answers Available
            </motion.h2>
            <motion.p
              className="text-gray-600 dark:text-slate-400 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              Many common questions about our features, plans, and resume best practices are answered in our comprehensive FAQ. Check there first for a speedy resolution!
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/faq">
                <Button variant="outline" animate={false}>Explore Our FAQs</Button>
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Contact;
