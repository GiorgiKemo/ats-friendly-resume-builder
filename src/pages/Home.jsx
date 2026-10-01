import React from 'react';
import { motion } from 'framer-motion';
import HeroSection from '../components/home/HeroSection';
import HowItWorksSection from '../components/home/HowItWorksSection';
import TemplateShowcase from '../components/home/TemplateShowcase';
import FeaturesSection from '../components/home/FeaturesSection';
import PremiumFeatures from '../components/home/PremiumFeatures';
import SuccessSection from '../components/home/SuccessSection';
import CTASection from '../components/home/CTASection';
import Button from '../components/ui/Button';
import AnimatedIcon from '../components/brand/AnimatedIcon';
import ResumeblePartnerCard from '../components/partners/ResumeblePartnerCard';

const Home = () => {
  return (
    <div className="bg-white dark:bg-[#070a10]">
      <HeroSection />
      <HowItWorksSection />
      <TemplateShowcase />
      <FeaturesSection />
      <PremiumFeatures />
      <SuccessSection />
      <section className="bg-slate-50 py-20 dark:bg-slate-900/60" aria-labelledby="human-help-heading">
        <div className="container mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
          <motion.div
            className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20">
              <AnimatedIcon name="user" className="h-[22px] w-[22px]" strokeWidth={2} />
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Human resume help</p>
            <h2 id="human-help-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Want help tailoring one resume?</h2>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
              Ask about the $99 one-resume, one-target-job service. We confirm availability, scope, and payment details before work begins, and you approve every factual change. No interview or hiring outcome is promised.
            </p>
            <div className="mt-auto pt-6">
              <Button as="link" to="/contact?offer=concierge" animate={false}>
                Request a $99 slot
              </Button>
            </div>
          </motion.div>
          <ResumeblePartnerCard source="home" />
        </div>
      </section>
      <CTASection />
    </div>
  );
};

export default Home;
