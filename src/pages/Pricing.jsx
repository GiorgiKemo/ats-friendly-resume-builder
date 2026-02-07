import React from 'react'; // Removed useEffect, useState
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import StripeCheckout from '../components/premium/StripeCheckout';
import SubscriptionManager from '../components/premium/SubscriptionManager';
import SubscriptionStatus from '../components/premium/SubscriptionStatus';
// import { supabase } from '../services/supabase'; // Unused
// import toast from 'react-hot-toast'; // Unused
import { motion } from 'framer-motion';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp, fadeInLeft, fadeInRight } from '../utils/animationVariants'; // Removed fadeIn, scaleIn

const Pricing = () => {
  const { user } = useAuth();
  const { isPremium } = useSubscription(); // Removed loading: subscriptionLoading
  const navigate = useNavigate();
  // const [loading, setLoading] = useState(false); // Unused state

  // Define Stripe price IDs for the plans
  // These are test price IDs for testing with your publishable key
  const STRIPE_PRICE_IDS = {
    PREMIUM_MONTHLY: 'price_1SxvKjBFInekdfRO3fwa3rZo', // Test price ID for monthly plan ($9.99/month)
    PREMIUM_YEARLY: 'price_1SxvKkBFInekdfROB5wh3cTM'   // Test price ID for yearly plan ($99.99/year)
  };

  const handleFreePlanClick = () => {
    if (user) {
      navigate('/builder');
    } else {
      navigate('/signup');
    }
  };

  // Premium status is managed through Stripe subscriptions in production

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
            Find Your Perfect Resume-Building Plan
          </motion.h1>
          <motion.p
            className="text-xl text-gray-600 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Unlock the tools you need to craft a job-winning, ATS-optimized resume. Get started free or go Premium for our most powerful AI features.
          </motion.p>
        </div>
      </AnimatedElement>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Free Plan */}
        <AnimatedElement variants={fadeInLeft} delay={0.2}>
          <motion.div
            className="bg-white rounded-lg shadow-md overflow-hidden h-full"
            whileHover={{
              y: -10,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <div className="p-8 h-full flex flex-col">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <h2 className="text-2xl font-bold mb-2">Basic (Free)</h2>
                <p className="text-gray-600 mb-4">Build a solid, ATS-friendly resume at no cost.</p>
                <div className="mb-6">
                  <motion.span
                    className="text-4xl font-bold"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    $0
                  </motion.span>
                  <span className="text-gray-600">/month</span>
                </div>
              </motion.div>

              <StaggeredContainer className="space-y-3 mb-8 flex-grow" staggerDelay={0.08}>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Essential ATS-Optimized Resumes: Craft effective resumes with clean, recruiter-approved single-column layouts.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Core Template Library: Choose from 4 professional templates, all designed for ATS compatibility.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Flexible Export Options: Download your resume in PDF and Word formats, perfectly formatted.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Fundamental Styling Tools: Access basic formatting options to personalize your resume.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Store Up To 3 Resumes: Keep multiple versions for different applications.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>ATS Knowledge Base: Learn with our guides and resources on ATS best practices.</span>
                  </li>
                </StaggeredItem>
              </StaggeredContainer>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleFreePlanClick}
                  animate={false}
                >
                  {user ? 'Continue with Free Plan' : 'Sign Up for Free'}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </AnimatedElement>

        {/* Premium Plan */}
        <AnimatedElement variants={fadeInRight} delay={0.4}>
          <motion.div
            className="bg-white rounded-lg shadow-md overflow-hidden border-2 border-blue-500 relative h-full"
            whileHover={{
              y: -10,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <motion.div
              className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 rounded-bl-lg font-medium text-sm"
              initial={{ x: 100 }}
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.6 }}
            >
              RECOMMENDED
            </motion.div>
            <div className="p-8 h-full flex flex-col">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <h2 className="text-2xl font-bold mb-2">Premium AI+</h2>
                <p className="text-gray-600 mb-4">Maximize your interview chances with our most advanced AI tools.</p>
                <div className="mb-6">
                  <motion.span
                    className="text-4xl font-bold"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    $9.99
                  </motion.span>
                  <span className="text-gray-600">/month</span>
                </div>
              </motion.div>

              <StaggeredContainer className="space-y-3 mb-8 flex-grow" staggerDelay={0.08} initialDelay={0.3}>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>All Basic features, PLUS:</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span className="font-medium">Intelligent AI Content Generation: Let our AI craft compelling, keyword-rich resume sections tailored to specific job descriptions.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Generous AI Quota: Up to 30 AI-powered resume enhancements or full drafts per month.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Expanded Creative Suite: Access an extended library of premium templates, fonts, and advanced customization tools.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Targeted Industry Insights: AI-driven suggestions optimized for your specific industry and career path.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Smart Location Adaptation: AI tailors content considering job location and your geographical preferences for better local targeting.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>Unlimited Resume Cloud: Store and manage all your resume versions without limits.</span>
                  </li>
                </StaggeredItem>
                <StaggeredItem>
                  <li className="flex items-start">
                    <motion.svg
                      className="h-6 w-6 text-green-500 mr-2 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      whileHover={{ scale: 1.2, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </motion.svg>
                    <span>VIP Priority Support: Get expedited assistance from our dedicated resume experts.</span>
                  </li>
                </StaggeredItem>
              </StaggeredContainer>

              {/* Show different buttons based on user and subscription status */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {!user ? (
                  // Not logged in - Sign up button
                  <Button
                    className="w-full"
                    onClick={() => navigate('/signup')}
                    animate={false}
                  >
                    Sign Up for Premium
                  </Button>
                ) : isPremium ? (
                  // Premium user - Manage subscription button
                  <SubscriptionManager
                    className="w-full"
                    buttonText="Manage Subscription"
                    buttonVariant="primary"
                  />
                ) : (
                  // Free user - Upgrade button
                  <StripeCheckout
                    priceId={STRIPE_PRICE_IDS.PREMIUM_MONTHLY}
                    planId="premium"
                    buttonText="Upgrade to Premium"
                    className="w-full"
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatedElement>
      </div>

      {/* FAQ Section */}
      <div className="mt-16">
        <AnimatedElement variants={fadeInUp} delay={0.2}>
          <h2 className="text-3xl font-bold text-center mb-8">Your Questions Answered</h2>
        </AnimatedElement>

        <StaggeredContainer className="max-w-4xl mx-auto space-y-6" staggerDelay={0.15} initialDelay={0.3}>
          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">How does the AI Resume Generator help me get more interviews?</h3>
              <p className="text-gray-700">
                Our AI Resume Generator is your secret weapon for crafting highly targeted resumes. By analyzing job descriptions and your profile (including career level, industry, and location preferences), it generates compelling, keyword-optimized content that speaks directly to what recruiters are looking for. It helps you showcase realistic career progression and relevant skills, ensuring your resume not only beats ATS filters but also impresses human reviewers, significantly boosting your interview chances.
              </p>
            </motion.div>
          </StaggeredItem>

          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">Is it easy to cancel or change my Premium plan?</h3>
              <p className="text-gray-700">
                Absolutely. You have full control over your Premium subscription. You can easily cancel or modify your plan at any time directly from your account settings. If you cancel, your Premium access continues until the end of your current billing cycle, so you never lose out on paid time.
              </p>
            </motion.div>
          </StaggeredItem>

          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">What if I downgrade from Premium? Will I lose my work?</h3>
              <p className="text-gray-700">
                No, you won't lose your work. If you downgrade to the Basic (Free) plan, you'll retain access to your resumes. However, the free plan includes storage for up to 3 resumes. If you have more, you'll be prompted to choose which ones to keep active or archive before completing the downgrade.
              </p>
            </motion.div>
          </StaggeredItem>

          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">How do I know the templates will work with ATS screeners?</h3>
              <p className="text-gray-700">
                We've meticulously designed every template based on deep research into how Applicant Tracking Systems operate. They feature clean, single-column structures, universally recognized section headings, and ATS-safe fonts. This ensures maximum readability for both software and human recruiters, giving your application the best chance of success.
              </p>
            </motion.div>
          </StaggeredItem>

          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">What can I achieve with the Basic (Free) plan?</h3>
              <p className="text-gray-700">
                Our Basic (Free) plan provides all the essentials to build a strong, ATS-compliant resume. You get access to our core resume builder, 4 professionally designed templates, PDF/Word export, storage for 3 resumes, and our valuable ATS best practice guides. It's the perfect way to start creating effective resumes without any cost.
              </p>
            </motion.div>
          </StaggeredItem>

          <StaggeredItem>
            <motion.div
              className="bg-white rounded-lg shadow-md p-6"
              whileHover={{
                y: -5,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <h3 className="text-xl font-semibold mb-2">What specific AI assistance does the Premium AI+ plan offer?</h3>
              <p className="text-gray-700">
                Our Premium AI+ plan unlocks a suite of powerful AI-driven assistance. This includes generating highly tailored content for various resume sections based on specific job descriptions, suggesting impactful keywords to boost ATS compatibility, helping you articulate your achievements effectively, and providing up to 30 AI-powered resume enhancements or complete drafts each month. You always retain full control to customize and perfect the AI-suggested content.
              </p>
            </motion.div>
          </StaggeredItem>
        </StaggeredContainer>
      </div>

      {/* CTA Section */}
      <AnimatedElement variants={fadeInUp} delay={0.4}>
        <motion.div
          className="mt-16 bg-blue-50 rounded-lg p-8 text-center"
          whileHover={{
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            y: -5
          }}
          transition={{ duration: 0.3 }}
        >
          <motion.h2
            className="text-2xl font-bold mb-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Need More Clarity? We're Here to Help!
          </motion.h2>
          <motion.p
            className="text-lg text-gray-700 mb-6 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Your confidence in choosing the right plan is important to us. If you have any further questions about our features, pricing, or how ResumeATS can accelerate your job search, our friendly support team is ready to assist.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link to="/contact">
              <Button variant="outline" animate={false}>Ask Our Team</Button>
            </Link>
          </motion.div>
        </motion.div>
      </AnimatedElement>

      {/* Subscription Status */}
      {user && (
        <AnimatedElement variants={fadeInUp} delay={0.6}>
          <div className="mt-12 max-w-md mx-auto">
            <motion.h3
              className="text-lg font-semibold mb-4 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              Subscription Status
            </motion.h3>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <SubscriptionStatus />
            </motion.div>
          </div>
        </AnimatedElement>
      )}
    </motion.div>
  );
};

export default Pricing;
