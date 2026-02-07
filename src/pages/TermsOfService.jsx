import React from 'react';
import { motion } from 'framer-motion';
import { fadeInUp, fadeInLeft, fadeInRight } from '../utils/animationVariants'; // Removed unused fadeIn, scaleIn

const TermsOfService = () => {
  return (
    <motion.div
      className="container mx-auto px-4 py-12 max-w-4xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <motion.h1
          className="text-3xl font-bold mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          ResumeATS Terms of Service
        </motion.h1>
        <motion.p
          className="text-gray-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Effective Date: February 7, 2026
        </motion.p>
      </motion.div>

      <motion.div
        className="prose prose-blue max-w-none"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
              delayChildren: 0.5
            }
          }
        }}
        initial="hidden"
        animate="visible"
      >
        <motion.section
          className="mb-8"
          variants={fadeInUp}
          whileHover={{
            x: 5,
            transition: { duration: 0.2 }
          }}
        >
          <motion.h2
            className="text-2xl font-semibold mb-4"
            variants={fadeInLeft}
          >
            1. Welcome to ResumeATS & Acceptance of Terms
          </motion.h2>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            Welcome to ResumeATS ("we," "our," or "us"). These Terms of Service (these "Terms") govern your access to and use of the ResumeATS website, services, and applications (collectively, the "Service").
          </motion.p>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use the Service.
          </motion.p>
        </motion.section>

        <motion.section
          className="mb-8"
          variants={fadeInUp}
          whileHover={{
            x: 5,
            transition: { duration: 0.2 }
          }}
        >
          <motion.h2
            className="text-2xl font-semibold mb-4"
            variants={fadeInLeft}
          >
            2. Who Can Use Our Service (Eligibility)
          </motion.h2>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            To use our Service, you must be at least 16 years of age. By using the Service, you confirm that you meet this age requirement and are fully able and competent to enter into and comply with these Terms.
          </motion.p>
        </motion.section>

        <motion.section
          className="mb-8"
          variants={fadeInUp}
          whileHover={{
            x: 5,
            transition: { duration: 0.2 }
          }}
        >
          <motion.h2
            className="text-2xl font-semibold mb-4"
            variants={fadeInLeft}
          >
            3. Your ResumeATS Account
          </motion.h2>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            Some parts of our Service require you to create an account. If you register for an account, you commit to providing information that is accurate, up-to-date, and complete, and to keep this information current.
          </motion.p>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            Safeguarding your account login details (like your password) is your responsibility. All activities that happen under your account are also your responsibility. Please inform us immediately if you suspect any unauthorized access or use of your account.
          </motion.p>
        </motion.section>

        <motion.section
          className="mb-8"
          variants={fadeInUp}
          whileHover={{
            x: 5,
            transition: { duration: 0.2 }
          }}
        >
          <motion.h2
            className="text-2xl font-semibold mb-4"
            variants={fadeInLeft}
          >
            4. How You Agree to Use Our Service
          </motion.h2>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            You commit to using our Service only for legal activities and in full agreement with these Terms. Specifically, you agree you will not:
          </motion.p>
          <motion.ul
            className="list-disc pl-8 mb-4"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: 0.1
                }
              }
            }}
          >
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Violate any applicable laws or regulations while using the Service.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity through the Service.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Disrupt or interfere with the Service, or any servers or networks connected to it.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Try to gain unauthorized access to any part of the Service, or any related systems or networks.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Transmit any viruses, malware, or other harmful code through the Service.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Collect or harvest personally identifiable information of others through the Service without their consent.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Use the Service for any commercial activities unless you have our express prior written permission.
            </motion.li>
          </motion.ul>
        </motion.section>

        <motion.section
          className="mb-8"
          variants={fadeInUp}
          whileHover={{
            x: 5,
            transition: { duration: 0.2 }
          }}
        >
          <motion.h2
            className="text-2xl font-semibold mb-4"
            variants={fadeInLeft}
          >
            5. Your Content and Our License to Use It
          </motion.h2>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            Our Service enables you to create, upload, save, and share various materials such as resumes and personal details (collectively, "User Content"). While you keep full ownership of your User Content, by using the Service, you grant ResumeATS a non-exclusive, transferable, sub-licensable, royalty-free, worldwide license. This license allows us to use, copy, modify, create derivative works from, distribute, and publicly display/perform your User Content solely for the purpose of operating, providing, and improving the Service.
          </motion.p>
          <motion.p
            className="mb-4"
            variants={fadeInRight}
          >
            By providing User Content, you confirm that:
          </motion.p>
          <motion.ul
            className="list-disc pl-8 mb-4"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: 0.1
                }
              }
            }}
          >
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              You either own your User Content or have all necessary rights to it, including the right to grant us the license outlined in these Terms.
            </motion.li>
            <motion.li
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              Your User Content does not infringe upon or violate the privacy rights, publicity rights, copyrights, or any other rights of any individual or entity.
            </motion.li>
          </motion.ul>
        </motion.section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Subscriptions, Payments, and Renewals</h2>
          <p className="mb-4">
            Access to certain premium features of our Service requires an active subscription. When you subscribe to a paid plan (e.g., Premium AI+), you agree to pay the applicable fees as outlined at the point of purchase. Generally, subscription fees are non-refundable, unless otherwise required by law or specified in these Terms (see our refund policy in the FAQ for more details).
          </p>
          <p className="mb-4">
            To ensure uninterrupted service, subscriptions automatically renew at the conclusion of each billing cycle (e.g., monthly or yearly). You can prevent auto-renewal by canceling your subscription through your account settings at any time before your current period ends.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Our Intellectual Property Rights</h2>
          <p className="mb-4">
            The Service, including all its original content (text, graphics, logos, software), features, and functionality, is the exclusive property of ResumeATS and its licensors. It is protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws. You may not use our branding, logos, or other proprietary assets without our prior written consent.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Important Disclaimers (No Warranties)</h2>
          <p className="mb-4">
            YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK. THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW, RESUMEATS EXPRESSLY DISCLAIMS ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          </p>
          <p className="mb-4">
            The Service may include AI-generated content. Such content is provided for informational and drafting purposes only, may be inaccurate or incomplete, and should be reviewed and verified by you before use or reliance.
          </p>
          <p className="mb-4">
            ResumeATS does not warrant that (i) the Service will meet your specific requirements; (ii) the Service will be uninterrupted, timely, secure, or error-free; (iii) the results that may be obtained from the use of the Service (including any AI-generated content) will be accurate, reliable, complete, or current; or (iv) any errors in the Service will be corrected.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Our Limitation of Liability</h2>
          <p className="mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL RESUMEATS, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, COVER, OR CONSEQUENTIAL DAMAGES (INCLUDING, WITHOUT LIMITATION, DAMAGES FOR LOST PROFITS, REVENUE, GOODWILL, USE, OR CONTENT) HOWEVER CAUSED, UNDER ANY THEORY OF LIABILITY, INCLUDING, WITHOUT LIMITATION, CONTRACT, TORT, WARRANTY, NEGLIGENCE, OR OTHERWISE, EVEN IF RESUMEATS HAS BEEN ADVISED AS TO THE POSSIBILITY OF SUCH DAMAGES, RESULTING FROM:
          </p>
          <ul className="list-disc pl-8 mb-4">
            <li>(i) Your access to, use of, or inability to access or use the Service;</li>
            <li>(ii) Any conduct or content of any third party on or related to the Service;</li>
            <li>(iii) Any content (including AI-generated content) obtained from or through the Service;</li>
            <li>(iv) Unauthorized access, use, or alteration of your transmissions or User Content, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. Your Responsibility to Indemnify Us</h2>
          <p className="mb-4">
            You agree to defend, indemnify, and hold harmless ResumeATS and its affiliates, officers, directors, employees, and agents from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, and expenses (including but not limited to attorney's fees) arising from: (i) your use of and access to the Service; (ii) your violation of any term of these Terms; or (iii) your violation of any third-party right, including without limitation any copyright, property, or privacy right.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Termination of Your Account or Service Access</h2>
          <p className="mb-4">
            We reserve the right to terminate or suspend your account and your access to the Service at our sole discretion, without prior notice or liability, for any reason whatsoever, including, but not limited to, a breach of these Terms.
          </p>
          <p className="mb-4">
            If your account or access is terminated, your right to use the Service will end immediately. You can choose to terminate your own account at any time by discontinuing use of the Service or by using the account deletion feature within your account settings, if available.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Updates to These Terms</h2>
          <p className="mb-4">
            We may update or modify these Terms from time to time. If we make changes that we consider material in our sole discretion, we will notify you (for example, by email or by posting a notice on our Service) at least thirty (30) days before the new terms become effective.
          </p>
          <p className="mb-4">
            Your continued use of the Service after any such revisions take effect constitutes your acceptance of the new Terms. If you do not agree with the new (or any) Terms, you must stop using the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Governing Law and Jurisdiction</h2>
          <p className="mb-4">
            These Terms and your use of the Service will be governed by and construed in accordance with the laws of Georgia, without giving effect to any principles of conflicts of law. You agree that any legal action or proceeding arising out of or relating to these Terms or the Service shall be brought exclusively in the courts located in Tbilisi, Georgia, and you consent to the jurisdiction of and venue in such courts.
          </p>
          <p className="mb-4">
            Our failure to enforce any right or provision of these Terms will not be deemed a waiver of such right or provision. If any provision of these Terms is found by a court of competent jurisdiction to be invalid or unenforceable, the parties nevertheless agree that the court should endeavor to give effect to the parties' intentions as reflected in the provision, and the other provisions of these Terms will remain in full force and effect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">14. Questions About These Terms</h2>
          <p className="mb-4">
            Should you have any questions or concerns regarding these Terms of Service, please do not hesitate to contact us at support@resumeats.com.
          </p>
        </section>
      </motion.div>
    </motion.div>
  );
};

export default TermsOfService;
