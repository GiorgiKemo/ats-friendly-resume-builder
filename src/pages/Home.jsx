import React from 'react';
import HeroSection from '../components/home/HeroSection';
import FeaturesSection from '../components/home/FeaturesSection';
import PremiumFeatures from '../components/home/PremiumFeatures';
import TestimonialsSection from '../components/home/TestimonialsSection';
import CTASection from '../components/home/CTASection';

const Home = () => {
  return (
    <div className="min-h-screen bg-white">
      <HeroSection />
      <FeaturesSection />
      <PremiumFeatures />
      <TestimonialsSection />
      <CTASection />
    </div>
  );
};

export default Home;
