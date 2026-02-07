import React from 'react';
import { motion } from 'framer-motion';
import { TouchLink } from '../components/ui';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp } from '../utils/animationVariants'; // Removed unused fadeIn, fadeInLeft, fadeInRight, scaleIn

const AboutUs = () => {
  return (
    <motion.div
      className="container mx-auto px-4 py-12 max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnimatedElement variants={fadeInUp}>
        <div className="text-center mb-12">
          <motion.h1
            className="text-4xl font-bold mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Empowering Your Career Journey
          </motion.h1>
          <motion.p
            className="text-xl text-gray-600 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            At ResumeATS, we're passionate about leveling the playing field for job seekers. We understand the frustration of crafting the perfect resume, only to have it filtered out by automated systems. That's why we built a smarter way to get your qualifications noticed and help you land the interviews you deserve.
          </motion.p>
        </div>
      </AnimatedElement>

      {/* Our Story Section */}
      <AnimatedElement variants={fadeInUp} delay={0.2}>
        <div className="mb-16">
          <motion.h2
            className="text-3xl font-bold mb-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            The Spark Behind ResumeATS
          </motion.h2>
          <motion.div
            className="bg-white rounded-lg shadow-md p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            whileHover={{
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              y: -5
            }}
          >
            <motion.p
              className="text-gray-700 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              ResumeATS was born from a shared frustration. As HR veterans and tech innovators, we repeatedly saw talented individuals overlooked simply because their resumes weren't 'ATS-friendly.' We knew there had to be a better way.
            </motion.p>
            <motion.p
              className="text-gray-700 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Driven by the belief that everyone deserves a fair chance, we pooled our expertise in recruitment, HR technology, and artificial intelligence. Our goal: to dismantle the barriers created by automated screening and empower job seekers.
            </motion.p>
            <motion.p
              className="text-gray-700"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              The result is ResumeATS – a platform that blends deep ATS understanding with intelligent AI. We're dedicated to helping you craft resumes that not only satisfy the algorithms but also compellingly tell your unique professional story to human decision-makers.
            </motion.p>
          </motion.div>
        </div>
      </AnimatedElement>

      {/* Our Mission Section */}
      <AnimatedElement variants={fadeInUp} delay={0.3}>
        <div className="mb-16">
          <motion.h2
            className="text-3xl font-bold mb-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            Our Guiding Mission
          </motion.h2>
          <motion.div
            className="bg-blue-50 p-8 rounded-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            whileHover={{
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              y: -5
            }}
          >
            <motion.p
              className="text-xl text-center font-medium text-gray-800"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              "To democratize career opportunities by providing every job seeker with intelligent tools and expert insights, transforming the resume from a hurdle into a powerful key that unlocks their dream job."
            </motion.p>
          </motion.div>
        </div>
      </AnimatedElement>

      {/* Our Team Section */}
      <AnimatedElement variants={fadeInUp} delay={0.4}>
        <div className="mb-16">
          <motion.h2
            className="text-3xl font-bold mb-8"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            Meet the Experts Behind Your Success
          </motion.h2>
          <StaggeredContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.15} initialDelay={0.6}>
            {/* Team Member 1 */}
            <StaggeredItem>
              <motion.div
                className="bg-white rounded-lg shadow-md overflow-hidden h-full"
                whileHover={{
                  y: -10,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="h-48 bg-gray-200 flex items-center justify-center"
                  whileHover={{ backgroundColor: "#e0e7ff" }}
                >
                  <motion.svg
                    className="h-24 w-24 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, color: "#4f46e5" }}
                    transition={{ type: "spring", stiffness: 300, damping: 10 }}
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </motion.svg>
                </motion.div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-1">Giorgi Kemoklidze</h3>
                  <p className="text-gray-600 mb-3">CEO</p>
                  <p className="text-gray-700">
                    A 15+ year veteran in HR and talent acquisition, Giorgi brings deep insider knowledge of what makes a resume truly stand out to hiring managers.
                  </p>
                </div>
              </motion.div>
            </StaggeredItem>

            {/* Team Member 2 */}
            <StaggeredItem>
              <motion.div
                className="bg-white rounded-lg shadow-md overflow-hidden h-full"
                whileHover={{
                  y: -10,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="h-48 bg-gray-200 flex items-center justify-center"
                  whileHover={{ backgroundColor: "#e0e7ff" }}
                >
                  <motion.svg
                    className="h-24 w-24 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, color: "#4f46e5" }}
                    transition={{ type: "spring", stiffness: 300, damping: 10 }}
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </motion.svg>
                </motion.div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-1">Michael Chen</h3>
                  <p className="text-gray-600 mb-3">Co-Founder & CTO</p>
                  <p className="text-gray-700">
                    Michael is the AI and machine learning architect who ensures our technology is not just smart, but also intuitively solves the real-world challenges job seekers face.
                  </p>
                </div>
              </motion.div>
            </StaggeredItem>

            {/* Team Member 3 */}
            <StaggeredItem>
              <motion.div
                className="bg-white rounded-lg shadow-md overflow-hidden h-full"
                whileHover={{
                  y: -10,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="h-48 bg-gray-200 flex items-center justify-center"
                  whileHover={{ backgroundColor: "#e0e7ff" }}
                >
                  <motion.svg
                    className="h-24 w-24 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, color: "#4f46e5" }}
                    transition={{ type: "spring", stiffness: 300, damping: 10 }}
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </motion.svg>
                </motion.div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-1">Emily Rodriguez</h3>
                  <p className="text-gray-600 mb-3">Head of Product</p>
                  <p className="text-gray-700">
                    Emily, our resident career coach and resume guru, translates her experience helping hundreds achieve career growth into practical, actionable strategies within our platform.
                  </p>
                </div>
              </motion.div>
            </StaggeredItem>
          </StaggeredContainer>
        </div>
      </AnimatedElement>

      {/* Our Values Section */}
      <AnimatedElement variants={fadeInUp} delay={0.5}>
        <div className="mb-16">
          <motion.h2
            className="text-3xl font-bold mb-8"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            The Principles That Drive Us
          </motion.h2>
          <StaggeredContainer className="grid md:grid-cols-2 gap-8" staggerDelay={0.15} initialDelay={0.7}>
            <StaggeredItem>
              <motion.div
                className="bg-white p-6 rounded-lg shadow-md h-full"
                whileHover={{
                  y: -5,
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4"
                  whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    whileHover={{ rotate: 15 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </motion.svg>
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Innovation</h3>
                <p className="text-gray-600">
                  Your success is our benchmark. We relentlessly innovate, ensuring our AI and tools are always a step ahead, giving you the edge in an ever-changing job market.
                </p>
              </motion.div>
            </StaggeredItem>

            <StaggeredItem>
              <motion.div
                className="bg-white p-6 rounded-lg shadow-md h-full"
                whileHover={{
                  y: -5,
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4"
                  whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    whileHover={{ rotate: 15 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </motion.svg>
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Accessibility</h3>
                <p className="text-gray-600">
                  Career opportunities shouldn't have barriers. We're committed to making our powerful resume tools intuitive and accessible to everyone, empowering all job seekers to shine.
                </p>
              </motion.div>
            </StaggeredItem>

            <StaggeredItem>
              <motion.div
                className="bg-white p-6 rounded-lg shadow-md h-full"
                whileHover={{
                  y: -5,
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4"
                  whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    whileHover={{ rotate: 15 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </motion.svg>
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Integrity</h3>
                <p className="text-gray-600">
                  Your trust is paramount. We operate with unwavering integrity, ensuring transparent practices and clear communication, so you can confidently navigate your job search with us.
                </p>
              </motion.div>
            </StaggeredItem>

            <StaggeredItem>
              <motion.div
                className="bg-white p-6 rounded-lg shadow-md h-full"
                whileHover={{
                  y: -5,
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
                }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <motion.div
                  className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4"
                  whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
                  transition={{ type: "spring", stiffness: 300, damping: 10 }}
                >
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    whileHover={{ rotate: 15 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </motion.svg>
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Empowerment</h3>
                <p className="text-gray-600">
                  We're more than just a resume builder; we're your career ally. We equip you with the tools, knowledge, and confidence to take command of your job search and achieve your professional ambitions.
                </p>
              </motion.div>
            </StaggeredItem>
          </StaggeredContainer>
        </div>
      </AnimatedElement>

      {/* CTA Section */}
      <AnimatedElement variants={fadeInUp} delay={0.6}>
        <motion.div
          className="bg-blue-600 rounded-lg p-8 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 100,
            damping: 15,
            delay: 0.8
          }}
          whileHover={{
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            y: -5
          }}
        >
          <motion.h2
            className="text-2xl font-bold text-white mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            Inspired by Our Story? Start Yours.
          </motion.h2>
          <motion.p
            className="text-xl text-blue-100 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.0 }}
          >
            Now that you know us, let us help you make your next career move. Leverage our expertise and smart resume tools to craft a resume that opens doors. Explore our Premium AI for an even greater advantage.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <TouchLink
              to="/builder"
              className="bg-white text-blue-700 hover:bg-gray-100 rounded-lg text-lg font-medium py-3 px-8"
              ariaLabel="Build your resume now"
            >
              Create Your Winning Resume
            </TouchLink>
          </motion.div>
        </motion.div>
      </AnimatedElement>
    </motion.div>
  );
};

export default AboutUs;
