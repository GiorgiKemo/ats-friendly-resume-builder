import React from 'react';
import HeroSection from '../components/home/HeroSection';
import FeaturesSection from '../components/home/FeaturesSection';
import PremiumFeatures from '../components/home/PremiumFeatures';
import HowItWorksSection from '../components/home/HowItWorksSection';
import CTASection from '../components/home/CTASection';

const Home = () => {
  return (
    <div className="bg-white dark:bg-slate-900">
      <HeroSection />
      <FeaturesSection />
      <PremiumFeatures />
      <HowItWorksSection />
      <CTASection />
    </div>
  );
};

export default Home;
