import React from 'react';
import { motion } from 'framer-motion';
import AnimatedElement from '../ui/AnimatedElement';
import StaggeredContainer from '../ui/StaggeredContainer';
import StaggeredItem from '../ui/StaggeredItem';
import { fadeInUp } from '../../utils/animationVariants';

const FeatureCard = ({ icon, title, description }) => (
  <StaggeredItem>
    {/* Phones: icon sits beside the title as a compact row; md+: icon stacks above. */}
    <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transform transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-700/30 sm:p-6 md:block">
      <motion.div
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 transition-colors dark:bg-blue-500/10 dark:ring-1 dark:ring-blue-400/20 md:mb-4 md:h-12 md:w-12"
        whileHover={{ scale: 1.1 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        {icon}
      </motion.div>
      <h3 className="text-xl font-semibold md:mb-2">{title}</h3>
      <p className="col-span-2 leading-relaxed text-gray-600 dark:text-slate-400">{description}</p>
    </div>
  </StaggeredItem>
);

const FeaturesSection = () => {
  const features = [
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-300 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: "Clear for People and Software.",
      description: "Use readable layouts and familiar section headings to help recruiters and parsing software understand your experience. Always follow the employer's file-format requirements."
    },
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-300 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Professional Look, Zero Hassle.",
      description: "Choose from five free resume templates and use the guided editor to build your resume. No design skills needed."
    },
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-300 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      title: "Your Resume, Your Way.",
      description: "Easily customize content and download your finished resume in PDF or Word format, ready to review and share."
    }
  ];

  return (
    <div className="py-12 sm:py-16 bg-white dark:bg-slate-800">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-8 sm:mb-12">Everything You Need for a Clear, <span className="whitespace-nowrap">ATS-Friendly</span> Resume.</h2>
        </AnimatedElement>

        <StaggeredContainer className="grid md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8" staggerDelay={0.15}>
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </StaggeredContainer>
      </div>
    </div>
  );
};

export default FeaturesSection;
