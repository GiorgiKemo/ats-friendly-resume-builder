import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignUp from '../components/auth/SignUp';
import { useAuth } from '../context/AuthContext';
import { PageHero } from '../components/ui';
import { fadeInUp } from '../utils/animationVariants';
import { getStripePlanConfig } from '../config/stripePlans';

const getPlanIntent = (planId) => {
  if (planId === 'free') return { planId: 'free', label: 'Basic (Free)' };
  if (planId === 'premium_monthly' || planId === 'premium_yearly') {
    const plan = getStripePlanConfig(planId);
    return { planId: plan.planId, label: `Premium AI+ — ${plan.label}` };
  }
  return null;
};

const SignUpPage = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const planIntent = getPlanIntent(searchParams.get('plan'));
  const premiumPlanSelected = planIntent?.planId === 'premium_monthly' || planIntent?.planId === 'premium_yearly';

  if (!loading && user) {
    return <Navigate to={premiumPlanSelected ? `/pricing?plan=${planIntent.planId}` : '/dashboard'} replace />;
  }

  return (
    <div>
      <PageHero
        className="signup-page-hero"
        eyebrow={
          planIntent?.planId === 'premium_monthly' || planIntent?.planId === 'premium_yearly'
            ? 'Create your account first'
            : 'Get started for free'
        }
        align="center"
        title="Create your ResumeATS account"
        lead="Build an ATS-friendly resume for free. No credit card required."
        titleId="signup-page-title"
      />

      <motion.div
        className="app-page signup-page-form max-w-md"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <SignUp planIntent={planIntent} />
      </motion.div>
    </div>
  );
};

export default SignUpPage;
