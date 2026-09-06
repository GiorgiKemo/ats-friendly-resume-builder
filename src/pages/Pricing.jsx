import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import StripeCheckout from '../components/premium/StripeCheckout';
import SubscriptionManager from '../components/premium/SubscriptionManager';
import SubscriptionStatus from '../components/premium/SubscriptionStatus';
import { motion } from 'framer-motion';
import { PageHero } from '../components/ui';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp } from '../utils/animationVariants';
import {
  STRIPE_CURRENCY,
  STRIPE_PLAN_CONFIG,
  formatStripePrice,
  getPremiumAnnualSavings,
  getStripePlanConfig,
} from '../config/stripePlans';

const FAQ_ITEMS = [
  {
    question: 'How does the AI Resume Generator help me get more interviews?',
    answer:
      'It uses your profile and a job description to suggest relevant wording and keywords. You review and edit the draft before using it. Keep only facts and skills you can support: AI and ATS checklist scores cannot guarantee interviews or hiring outcomes.',
  },
  {
    question: 'Is it easy to cancel or change my Premium plan?',
    answer:
      'Absolutely. You have full control over your Premium subscription. You can easily cancel or modify your plan at any time directly from your account settings. If you cancel, your Premium access continues until the end of your current billing cycle, so you never lose out on paid time.',
  },
  {
    question: 'What if I downgrade from Premium? Will I lose my work?',
    answer:
      'Your saved resumes are not automatically deleted when Premium ends. The free plan allows up to 3 resumes, so you may need to reduce your saved versions before creating another. Export any versions you want to keep before deleting them.',
  },
  {
    question: 'How do I know the templates will work with ATS screeners?',
    answer:
      'Our templates use standard resume sections and readable text. For the simplest reading order, choose a single-column layout. Follow the employer\'s requested file format, review the exported file, and remember that parsing varies between systems.',
  },
  {
    question: 'What can I achieve with the Basic (Free) plan?',
    answer:
      "Our Basic (Free) plan provides all the essentials to build a strong, ATS-compliant resume. You get access to our core resume builder, 4 professionally designed templates, PDF/Word export, storage for 3 resumes, and our valuable ATS best practice guides. It's the perfect way to start creating effective resumes without any cost.",
  },
  {
    question: 'What specific AI assistance does the Premium AI+ plan offer?',
    answer:
      'Our Premium AI+ plan unlocks a suite of powerful AI-driven assistance. This includes generating highly tailored content for various resume sections based on specific job descriptions, suggesting impactful keywords to boost ATS compatibility, helping you articulate your achievements effectively, and providing up to 30 AI-powered resume enhancements or complete drafts each month. You always retain full control to customize and perfect the AI-suggested content.',
  },
];

const CheckIcon = () => (
  <svg
    className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
  </svg>
);

const FeatureItem = ({ children, emphasis = false }) => (
  <li className="flex items-start gap-3">
    <CheckIcon />
    <span className={emphasis ? 'font-medium text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300'}>
      {children}
    </span>
  </li>
);

const Pricing = () => {
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const navigate = useNavigate();
  const [selectedPremiumPlanId, setSelectedPremiumPlanId] = useState('premium_monthly');
  const premiumOptions = [STRIPE_PLAN_CONFIG.premium_monthly, STRIPE_PLAN_CONFIG.premium_yearly];
  const selectedPremiumPlan = getStripePlanConfig(selectedPremiumPlanId);
  const annualSavings = getPremiumAnnualSavings();

  const handleFreePlanClick = () => {
    if (user) {
      navigate('/builder');
    } else {
      navigate('/signup');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <PageHero
        eyebrow="Pricing"
        align="center"
        title="Find your perfect resume-building plan."
        lead="Unlock the tools you need to craft a job-winning, ATS-optimized resume. Start free or go Premium for our most powerful AI features."
        titleId="pricing-page-title"
        wide
      />

      <div className="app-page space-y-16">
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          <AnimatedElement variants={fadeInUp} delay={0.1}>
            <motion.div
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-shadow duration-200 ease-out hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40"
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            >
              <div className="flex flex-1 flex-col p-7 sm:p-8">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">Basic (Free)</h2>
                  <p className="mt-1 text-gray-600 dark:text-slate-400">
                    Build a solid, ATS-friendly resume at no cost.
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-gray-600 dark:text-slate-400">/month</span>
                  </div>
                </div>

                <ul className="mt-6 mb-8 flex-grow space-y-3">
                  <FeatureItem>Clear resume layouts with standard section headings.</FeatureItem>
                  <FeatureItem>Core Template Library: 4 professional templates, all ATS-compatible.</FeatureItem>
                  <FeatureItem>PDF and Word exports. Review the downloaded file before applying.</FeatureItem>
                  <FeatureItem>Fundamental Styling Tools: basic formatting options to personalize your resume.</FeatureItem>
                  <FeatureItem>Store up to 3 resumes for different applications.</FeatureItem>
                  <FeatureItem>ATS Knowledge Base: guides and resources on best practices.</FeatureItem>
                </ul>

                <Button variant="outline" className="w-full" onClick={handleFreePlanClick} animate={false}>
                  {user ? 'Continue with Free Plan' : 'Sign Up for Free'}
                </Button>
              </div>
            </motion.div>
          </AnimatedElement>

          <AnimatedElement variants={fadeInUp} delay={0.2}>
            <motion.div
              className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-blue-500 bg-white shadow-md transition-shadow duration-200 ease-out hover:shadow-lg dark:bg-slate-800 dark:shadow-slate-900/40"
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            >
              <div className="absolute right-0 top-0 rounded-bl-xl bg-blue-500 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                Recommended
              </div>
              <div className="flex flex-1 flex-col p-7 sm:p-8">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">Premium AI+</h2>
                  <p className="mt-1 text-gray-600 dark:text-slate-400">
                    Maximize your interview chances with our most advanced AI tools.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {premiumOptions.map((plan) => {
                      const isSelected = plan.planId === selectedPremiumPlan.planId;
                      return (
                        <button
                          key={plan.planId}
                          type="button"
                          onClick={() => setSelectedPremiumPlanId(plan.planId)}
                          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                              : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/60'
                          }`}
                          aria-pressed={isSelected}
                        >
                          <div className="text-sm font-semibold">{plan.label}</div>
                          <div className="text-xs opacity-80">{plan.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{formatStripePrice(selectedPremiumPlan.amount)}</span>
                      <span className="text-gray-600 dark:text-slate-400">{selectedPremiumPlan.priceSuffix}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                      Billed in {STRIPE_CURRENCY}.{' '}
                      {selectedPremiumPlan.planId === 'premium_yearly' && annualSavings > 0
                        ? `Save ${formatStripePrice(annualSavings)} compared with paying monthly.`
                        : 'Cancel any time from your account settings.'}
                    </p>
                  </div>
                </div>

                <ul className="mt-6 mb-8 flex-grow space-y-3">
                  <FeatureItem>All Basic features, PLUS:</FeatureItem>
                  <FeatureItem emphasis>
                    Intelligent AI Content Generation tailored to specific job descriptions.
                  </FeatureItem>
                  <FeatureItem>Generous AI Quota: up to 30 enhancements or full drafts per month.</FeatureItem>
                  <FeatureItem>Expanded Creative Suite: extended premium templates, fonts, and customization.</FeatureItem>
                  <FeatureItem>Targeted Industry Insights: AI-driven suggestions optimized for your field.</FeatureItem>
                  <FeatureItem>Smart Location Adaptation for better local targeting.</FeatureItem>
                  <FeatureItem>Unlimited Resume Cloud: store and manage all your versions.</FeatureItem>
                  <FeatureItem>Direct Premium Support: inbox plus the published billing phone line.</FeatureItem>
                </ul>

                {!user ? (
                  <Button className="w-full" onClick={() => navigate('/signup')} animate={false}>
                    {selectedPremiumPlan.planId === 'premium_yearly'
                      ? 'Sign Up for Premium Yearly'
                      : 'Sign Up for Premium Monthly'}
                  </Button>
                ) : isPremium ? (
                  <SubscriptionManager
                    className="w-full"
                    buttonText="Manage Subscription"
                    buttonVariant="primary"
                  />
                ) : (
                  <>
                    <StripeCheckout
                      priceId={selectedPremiumPlan.priceId}
                      planId={selectedPremiumPlan.planId}
                      buttonText={
                        selectedPremiumPlan.planId === 'premium_yearly'
                          ? 'Upgrade to Premium Yearly'
                          : 'Upgrade to Premium Monthly'
                      }
                      className="w-full"
                      disabled={!selectedPremiumPlan.priceId}
                    />
                    {!selectedPremiumPlan.priceId && (
                      <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                        Stripe price configuration is missing for this billing option.
                      </p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </AnimatedElement>
        </div>

        <section className="mx-auto max-w-4xl">
          <AnimatedElement variants={fadeInUp} delay={0.1}>
            <h2 className="mb-6 text-center text-2xl font-bold sm:text-3xl">Your Questions Answered</h2>
          </AnimatedElement>
          <StaggeredContainer className="space-y-4" staggerDelay={0.08} initialDelay={0.1}>
            {FAQ_ITEMS.map((item) => (
              <StaggeredItem key={item.question}>
                <article className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40">
                  <h3 className="text-lg font-semibold sm:text-xl">{item.question}</h3>
                  <p className="mt-2 text-gray-700 dark:text-slate-300">{item.answer}</p>
                </article>
              </StaggeredItem>
            ))}
          </StaggeredContainer>
        </section>

        <AnimatedElement variants={fadeInUp} delay={0.1}>
          <section className="mx-auto max-w-3xl rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 p-8 text-center shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:via-blue-500/5 dark:to-indigo-500/10">
            <h2 className="text-2xl font-bold sm:text-3xl">Need more clarity? We&apos;re here to help.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-700 dark:text-slate-300">
              If you have any further questions about our features, pricing, or how ResumeATS can accelerate your job search, our friendly support team is ready to assist.
            </p>
            <div className="mt-5 flex justify-center">
              <Button as="link" to="/contact" variant="outline" animate={false}>
                Ask our team
              </Button>
            </div>
          </section>
        </AnimatedElement>

        {user && (
          <AnimatedElement variants={fadeInUp} delay={0.1}>
            <div className="mx-auto max-w-md">
              <h3 className="mb-4 text-center text-lg font-semibold">Subscription Status</h3>
              <SubscriptionStatus />
            </div>
          </AnimatedElement>
        )}
      </div>
    </motion.div>
  );
};

export default Pricing;
