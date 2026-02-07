import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TouchLink } from '../components/ui';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp } from '../utils/animationVariants'; // Re-added fadeInUp as it is used

const Learn = () => {
  const location = useLocation();

  useEffect(() => {
    // Check if there's a hash in the URL
    if (location.hash) {
      // Get the element with the matching ID
      const element = document.getElementById(location.hash.substring(1));

      // If the element exists, scroll to it
      if (element) {
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location]);

  return (
    <motion.div
      className="container mx-auto px-4 py-12 max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            ATS Resume Guide
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Learn how to create resumes that successfully pass through Applicant Tracking Systems and get noticed by hiring managers.
          </p>
        </div>
      </AnimatedElement>

      {/* What is ATS Section */}
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <motion.div
          className="bg-white rounded-lg shadow-md p-8 mb-10"
          whileHover={{
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            y: -5,
            transition: { duration: 0.3 }
          }}
        >
          <h2 className="text-2xl font-bold mb-4">What is an ATS?</h2>
          <p className="text-gray-700 mb-4">
            An Applicant Tracking System (ATS) is software used by employers to collect, sort, scan, and rank job applications.
            Over 75% of companies, including 99% of Fortune 500 companies, use ATS software to streamline their hiring process.
          </p>
          <p className="text-gray-700 mb-4">
            When you submit a resume, it's likely going through an ATS before a human ever sees it. The system scans your resume
            for keywords, experience, skills, and other criteria to determine if you're a good match for the position.
          </p>
          <p className="text-gray-700">
            If your resume isn't properly formatted for ATS compatibility, it may be rejected before a hiring manager ever gets
            the chance to review your qualifications.
          </p>
        </motion.div>
      </AnimatedElement>

      {/* ATS Best Practices */}
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <motion.div
          id="best-practices"
          className="bg-white rounded-lg shadow-md p-8 mb-10"
          whileHover={{
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            y: -5,
            transition: { duration: 0.3 }
          }}
        >
          <h2 className="text-2xl font-bold mb-6">ATS Best Practices</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-3">Do's</h3>
              <StaggeredContainer className="space-y-3" staggerDelay={0.05} initialDelay={0.1}>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Use a clean, single-column layout</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Include standard section headings (e.g., "Work Experience," "Education")</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Use ATS-friendly fonts (Arial, Calibri, Helvetica, etc.)</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Include keywords from the job description</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Use standard date formats (MM/YYYY or Month YYYY)</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save your resume as a .docx or .pdf file</span>
                  </div>
                </StaggeredItem>
              </StaggeredContainer>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">Don'ts</h3>
              <StaggeredContainer className="space-y-3" staggerDelay={0.05} initialDelay={0.1}>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Use tables, columns, headers, or footers</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Include images, graphics, or charts</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Use fancy fonts, colors, or creative layouts</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Include information in the header or footer</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Use non-standard section headings</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <svg
                      className="h-6 w-6 text-red-500 mr-2 flex-shrink-0 transform transition-all duration-300 hover:scale-110 hover:rotate-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Submit files in non-standard formats (.pages, .txt)</span>
                  </div>
                </StaggeredItem>
              </StaggeredContainer>
            </div>
          </div>
        </motion.div>
      </AnimatedElement>

      {/* Keyword Optimization */}
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <motion.div
          id="keyword-optimization"
          className="bg-white rounded-lg shadow-md p-8 mb-10"
          whileHover={{
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            y: -5,
            transition: { duration: 0.3 }
          }}
        >
          <h2 className="text-2xl font-bold mb-4">Keyword Optimization</h2>
          <p className="text-gray-700 mb-6">
            ATS systems scan resumes for relevant keywords to determine if a candidate is a good match for the position.
            Here's how to optimize your resume with the right keywords:
          </p>

          <StaggeredContainer className="space-y-6" staggerDelay={0.05} initialDelay={0.1}>
            <StaggeredItem>
              <div className="bg-blue-50 p-6 rounded-lg transform transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:bg-blue-100">
                <h3 className="text-lg font-semibold mb-3">1. Analyze the Job Description</h3>
                <p className="text-gray-700">
                  Carefully read the job posting and identify key skills, qualifications, and responsibilities.
                  These are likely the keywords the ATS will be scanning for.
                </p>
              </div>
            </StaggeredItem>

            <StaggeredItem>
              <div className="bg-blue-50 p-6 rounded-lg transform transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:bg-blue-100">
                <h3 className="text-lg font-semibold mb-3">2. Include Exact Keyword Matches</h3>
                <p className="text-gray-700">
                  Use the exact terminology from the job description when possible. For example, if the job requires
                  "project management," don't just write "managed projects."
                </p>
              </div>
            </StaggeredItem>

            <StaggeredItem>
              <div className="bg-blue-50 p-6 rounded-lg transform transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:bg-blue-100">
                <h3 className="text-lg font-semibold mb-3">3. Use Both Acronyms and Full Terms</h3>
                <p className="text-gray-700">
                  Include both the acronym and the spelled-out term, e.g., "Search Engine Optimization (SEO)" to
                  ensure the ATS recognizes either version.
                </p>
              </div>
            </StaggeredItem>

            <StaggeredItem>
              <div className="bg-blue-50 p-6 rounded-lg transform transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:bg-blue-100">
                <h3 className="text-lg font-semibold mb-3">4. Incorporate Industry-Specific Terminology</h3>
                <p className="text-gray-700">
                  Include relevant industry terms, tools, software, and methodologies specific to your field.
                </p>
              </div>
            </StaggeredItem>

            <StaggeredItem>
              <div className="bg-blue-50 p-6 rounded-lg transform transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:bg-blue-100">
                <h3 className="text-lg font-semibold mb-3">5. Avoid Keyword Stuffing</h3>
                <p className="text-gray-700">
                  While keywords are important, don't overdo it. Your resume should still read naturally and be
                  written for humans, not just the ATS.
                </p>
              </div>
            </StaggeredItem>
          </StaggeredContainer>
        </motion.div>
      </AnimatedElement>

      {/* ATS-Friendly Formatting */}
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <motion.div
          id="formatting"
          className="bg-white rounded-lg shadow-md p-8 mb-10"
          whileHover={{
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            y: -5,
            transition: { duration: 0.3 }
          }}
        >
          <h2 className="text-2xl font-bold mb-6">ATS-Friendly Formatting</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Layout & Structure</h3>
              <StaggeredContainer className="space-y-3" staggerDelay={0.05} initialDelay={0.1}>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Use a clean, single-column layout</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Standard 1-inch margins on all sides</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Clear section headings (Work Experience, Education, Skills)</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Consistent formatting throughout the document</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Simple bullet points (• or -) for listing accomplishments</span>
                  </div>
                </StaggeredItem>
              </StaggeredContainer>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Fonts & Styling</h3>
              <StaggeredContainer className="space-y-3" staggerDelay={0.05} initialDelay={0.1}>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Use ATS-friendly fonts: Arial, Calibri, Helvetica, Times New Roman</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Font size: 10-12pt for body text, 14-16pt for headings</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Simple formatting (bold, italics) used sparingly</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>Black text on white background</span>
                  </div>
                </StaggeredItem>
                <StaggeredItem>
                  <div className="flex items-start transform transition-all duration-300 hover:translate-x-1">
                    <span className="text-blue-600 font-bold mr-2 transform transition-all duration-300 hover:scale-110">•</span>
                    <span>No text boxes, tables, or columns</span>
                  </div>
                </StaggeredItem>
              </StaggeredContainer>
            </div>
          </div>
        </motion.div>
      </AnimatedElement>

      {/* CTA Section */}
      <AnimatedElement variants={fadeInUp} delay={0.1}>
        <motion.div
          className="bg-blue-600 rounded-lg p-8 text-center"
          whileHover={{
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            y: -5,
            transition: { duration: 0.3 }
          }}
        >
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to Create Your ATS-Optimized Resume?
          </h2>
          <p className="text-xl text-blue-100 mb-6">
            Our resume builder is designed to help you create resumes that pass through ATS systems and get noticed by hiring managers.
          </p>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <TouchLink
              to="/builder"
              className="bg-white text-blue-700 hover:bg-gray-100 rounded-lg text-lg font-medium py-3 px-8"
              ariaLabel="Build your resume now"
            >
              Build Your Resume Now
            </TouchLink>
          </motion.div>
        </motion.div>
      </AnimatedElement>
    </motion.div>
  );
};

export default Learn;
