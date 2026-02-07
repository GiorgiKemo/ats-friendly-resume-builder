import React from 'react';
import { motion } from 'framer-motion';
import AnimatedElement from '../ui/AnimatedElement';
import StaggeredContainer from '../ui/StaggeredContainer';
import StaggeredItem from '../ui/StaggeredItem';
import { fadeInUp } from '../../utils/animationVariants';

const FeatureCard = ({ icon, title, description }) => (
  <StaggeredItem>
    <div className="bg-white p-6 rounded-lg shadow-md h-full transform transition-transform duration-300 hover:shadow-lg hover:-translate-y-1">
      <motion.div
        className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4"
        whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        {icon}
      </motion.div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  </StaggeredItem>
);

const FeaturesSection = () => {
  const features = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: "Beat the Application Robots.",
      description: "Our resumes are built with ATS best practices in mind, using clean formats and standard sections to ensure your application gets seen."
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Professional Look, Zero Hassle.",
      description: "Choose from a library of recruiter-approved templates (4 free!) and use our intuitive editor to build your resume quickly. No design skills needed."
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      title: "Your Resume, Your Way.",
      description: "Easily customize content and download your finished resume in PDF or Word format, ready to impress."
    }
  ];

  return (
    <div className="py-16 bg-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need for a Job-Winning Resume.</h2>
        </AnimatedElement>

        <StaggeredContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.15}>
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
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
