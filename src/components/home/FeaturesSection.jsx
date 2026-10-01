import React from 'react';
import { motion } from 'framer-motion';
import AnimatedElement from '../ui/AnimatedElement';
import StaggeredContainer from '../ui/StaggeredContainer';
import StaggeredItem from '../ui/StaggeredItem';
import { fadeInUp } from '../../utils/animationVariants';

const FeatureCard = ({ icon, title, description }) => (
  <StaggeredItem>
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.03] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      <motion.div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-100 transition-colors dark:bg-blue-500/10 dark:ring-blue-400/20"
        whileHover={{ scale: 1.1 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        {icon}
      </motion.div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  </StaggeredItem>
);

const FeaturesSection = () => {
  const features = [
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: "Clear for people and software",
      description: "Use readable layouts and familiar section headings to help recruiters and parsing software understand your experience. Always follow the employer's file-format requirements."
    },
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Professional look, zero hassle",
      description: "Choose from five free resume templates and use the guided editor to build your resume. No design skills needed."
    },
    {
      icon: (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      title: "Your resume, your way",
      description: "Easily customize content and download your finished resume in PDF or Word format, ready to review and share."
    }
  ];

  return (
    <div className="bg-white py-16 dark:bg-slate-900 md:py-20">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="mx-auto mb-12 max-w-3xl text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Everything you need for a clear, ATS-friendly resume</h2>
        </AnimatedElement>

        <StaggeredContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.15}>
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
