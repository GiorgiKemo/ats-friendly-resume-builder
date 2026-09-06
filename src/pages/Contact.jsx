import React, { useEffect, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import { PageHero } from '../components/ui';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { fadeInUp } from '../utils/animationVariants';
import {
  SUPPORT_ADDRESS_LINES,
  SUPPORT_BILLING_PRIORITY,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_URI,
  SUPPORT_RESPONSE_TIME,
} from '../config/supportInfo';
import { submitContactInquiry } from '../services/publicEngagementService';

const supportPromises = (responseTime, billingPriority) => [
  { label: 'Response time', value: responseTime },
  { label: 'Billing', value: billingPriority },
  { label: 'Tracking', value: 'Messages submitted here are logged inside ResumeATS.' },
];

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const promises = supportPromises(SUPPORT_RESPONSE_TIME, SUPPORT_BILLING_PRIORITY);

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
      description:
        'Use this for urgent billing or subscription help. Email is still the best default for detailed product issues.',
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
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSubmitResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const submitted = formData;
    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      await submitContactInquiry({
        ...submitted,
        source: 'contact_page',
      });

      if (!mountedRef.current) return;
      const message = `Your message was submitted. ${SUPPORT_RESPONSE_TIME}.`;
      toast.success(message);
      setSubmitResult({ ok: true, message });
      setFormData((current) => current === submitted ? { name: '', email: '', subject: '', message: '' } : current);
    } catch {
      if (!mountedRef.current) return;
      const message = `We could not submit your message right now. Please email us directly at ${SUPPORT_EMAIL}.`;
      toast.error(message);
      setSubmitResult({ ok: false, message });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

  return (
    <div>
      <PageHero
        eyebrow="Contact"
        align="center"
        title="Get in touch with ResumeATS."
        lead="Reach our team for product questions, billing help, feedback, or support with your resume workflow. Messages submitted here are logged directly in ResumeATS so we can reply faster and keep a support trail."
        titleId="contact-page-title"
        wide
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {promises.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-gray-200 bg-white/85 px-4 py-3 text-left shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/60"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                {item.label}
              </p>
              <p className="mt-1.5 text-sm text-gray-700 dark:text-slate-300">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <div className="app-page max-w-5xl">
        <motion.div
          className="grid gap-8 md:grid-cols-2 lg:gap-12"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.18, delayChildren: 0.2 } },
          }}
          initial="hidden"
          animate="visible"
        >
          <motion.section
            className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-8 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40"
            variants={fadeInUp}
          >
            <h2 className="text-2xl font-bold sm:text-3xl">Send a support request</h2>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
              <p className="font-semibold">Best for detailed issues</p>
              <p className="mt-1 text-blue-800/90 dark:text-blue-200/90">
                Include the page you were on, what you expected, what happened instead, and whether the issue affected export, billing, login, or the extension. {SUPPORT_RESPONSE_TIME}.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>
                  Your name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="subject" className={labelClass}>
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="message" className={labelClass}>
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows="6"
                  className={inputClass}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting} animate={false}>
                {isSubmitting ? 'Submitting…' : 'Send message'}
              </Button>
              {submitResult && (
                <p role={submitResult.ok ? 'status' : 'alert'} className="text-sm text-gray-700 dark:text-slate-300">
                  {submitResult.message}
                </p>
              )}
            </form>
          </motion.section>

          <motion.div variants={fadeInUp} className="space-y-6">
            <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-8 dark:border-blue-500/20 dark:from-blue-500/10 dark:via-blue-500/5 dark:to-indigo-500/10">
              <h2 className="text-2xl font-bold sm:text-3xl">Choose the right channel</h2>
              <div className="mt-5 space-y-3">
                {contactLanes.map((lane) => (
                  <div
                    key={lane.title}
                    className="rounded-xl border border-blue-100 bg-white/85 px-4 py-4 dark:border-blue-500/20 dark:bg-slate-900/40"
                  >
                    <h3 className="text-base font-semibold sm:text-lg">{lane.title}</h3>
                    {lane.href ? (
                      <a
                        href={lane.href}
                        className="mt-1 inline-block break-words text-gray-700 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300"
                      >
                        {lane.value}
                      </a>
                    ) : (
                      <p className="mt-1 text-gray-700 dark:text-slate-300">{lane.value}</p>
                    )}
                    <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{lane.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-8 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40">
              <h2 className="text-2xl font-bold sm:text-3xl">Before you reach out</h2>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-gray-700 dark:text-slate-300">
                <li>For export issues, mention whether the problem was in DOCX, PDF, or the live preview.</li>
                <li>For billing questions, include the email used for checkout so we can find the subscription faster.</li>
                <li>For extension issues, tell us which job board or site you were using when it happened.</li>
              </ul>
              <p className="mt-4 text-sm text-gray-500 dark:text-slate-500">
                Many plan, feature, and resume workflow questions are already answered in the FAQ.
              </p>
              <div className="mt-5">
                <Button as="link" to="/faq" variant="outline" animate={false}>
                  Explore our FAQs
                </Button>
              </div>
            </section>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Contact;
