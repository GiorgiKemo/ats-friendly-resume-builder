import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { fadeInLeft, fadeInRight } from '../utils/animationVariants'; // Removed unused fadeIn, fadeInUp, scaleIn
import {
  SUPPORT_ADDRESS_LINES,
  SUPPORT_BILLING_PRIORITY,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_URI,
  SUPPORT_RESPONSE_TIME,
} from '../config/supportInfo';
import { submitContactInquiry } from '../services/publicEngagementService';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supportPromises = [
    {
      label: 'Response time',
      value: SUPPORT_RESPONSE_TIME,
    },
    {
      label: 'Billing',
      value: SUPPORT_BILLING_PRIORITY,
    },
    {
      label: 'Tracking',
      value: 'Messages submitted here are logged inside ResumeATS.',
    },
  ];

  const contactLanes = [
    {
      title: 'Support inbox',
      value: SUPPORT_EMAIL,
      href: `mailto:${SUPPORT_EMAIL}`,
      description: 'Best for product issues, export problems, extension bugs, and general questions.',
    },
    {
      title: 'Premium / billing line',
      value: SUPPORT_PHONE_DISPLAY,
      href: `tel:${SUPPORT_PHONE_URI}`,
      description: 'Use this for urgent billing or subscription help. Email is still the best default for detailed product issues.',
    },
    {
      title: 'Mailing address',
      value: SUPPORT_ADDRESS_LINES.join(', '),
      href: null,
      description: 'Registered business address for administrative correspondence.',
    },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await submitContactInquiry({
        ...formData,
        source: 'contact_page',
      });

      toast.success(`Your message was sent. ${SUPPORT_RESPONSE_TIME}.`);
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
    } catch {
      toast.error(`We could not submit your message right now. Please email us directly at ${SUPPORT_EMAIL}.`);
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
          Reach our team for product questions, billing help, feedback, or support with your resume workflow. Messages submitted here are logged directly in ResumeATS so we can reply faster and keep a support trail.
        </motion.p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3 max-w-5xl mx-auto">
          {supportPromises.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 text-left shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{item.label}</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">{item.value}</p>
            </div>
          ))}
        </div>
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
            Send a Support Request
          </motion.h2>
          <div className="mb-6 rounded-2xl border border-blue-100 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-4">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Best for detailed issues</p>
            <p className="mt-1 text-sm text-blue-800 dark:text-blue-200/90">
              Include the page you were on, what you expected, what happened instead, and whether the issue affected export, billing, login, or the extension. {SUPPORT_RESPONSE_TIME}.
            </p>
          </div>
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
                {isSubmitting ? 'Submitting...' : 'Send Message'}
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
              Choose the Right Channel
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
              {contactLanes.map((lane) => (
                <motion.div
                  key={lane.title}
                  className="rounded-2xl border border-blue-100 dark:border-blue-800/60 bg-white/70 dark:bg-slate-900/40 px-5 py-4"
                  variants={{
                    hidden: { opacity: 0, x: -20 },
                    visible: { opacity: 1, x: 0 }
                  }}
                >
                  <h3 className="text-lg font-semibold">{lane.title}</h3>
                  {lane.href ? (
                    <a href={lane.href} className="mt-1 inline-block text-gray-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-300">
                      {lane.value}
                    </a>
                  ) : (
                    <p className="mt-1 text-gray-700 dark:text-slate-300">{lane.value}</p>
                  )}
                  <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{lane.description}</p>
                </motion.div>
              ))}
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
              Before You Reach Out
            </motion.h2>
            <motion.ul
              className="text-gray-600 dark:text-slate-400 mb-4 space-y-3 list-disc pl-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              <li>For export issues, mention whether the problem was in DOCX, PDF, or the live preview.</li>
              <li>For billing questions, include the email used for checkout so we can find the subscription faster.</li>
              <li>For extension issues, tell us which job board or site you were using when it happened.</li>
            </motion.ul>
            <p className="text-sm text-gray-500 dark:text-slate-500 mb-4">
              Many plan, feature, and resume workflow questions are already answered in the FAQ. It is the fastest place to check before opening a support request.
            </p>
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
