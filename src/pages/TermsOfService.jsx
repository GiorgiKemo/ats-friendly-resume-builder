import React from 'react';
import { motion } from 'framer-motion';
import { PageHero } from '../components/ui';
import { fadeInUp } from '../utils/animationVariants';
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_URI } from '../config/supportInfo';

const sectionClass = 'space-y-4 text-gray-700 dark:text-slate-300';
const headingClass = 'text-xl font-semibold text-gray-900 dark:text-slate-100 sm:text-2xl';

const Section = ({ title, children }) => (
  <motion.section className="space-y-3" variants={fadeInUp}>
    <h2 className={headingClass}>{title}</h2>
    <div className={sectionClass}>{children}</div>
  </motion.section>
);

const TermsOfService = () => {
  return (
    <div>
      <PageHero
        eyebrow="Legal"
        title="ResumeATS Terms of Service"
        lead="The rules that govern access to ResumeATS, your account, payments, and the content you create."
        titleId="terms-page-title"
      >
        <p className="text-sm text-gray-600 dark:text-slate-400">Effective Date: February 7, 2026</p>
      </PageHero>

      <motion.div
        className="app-page app-page--narrow space-y-8"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
        }}
        initial="hidden"
        animate="visible"
      >
        <Section title="1. Welcome & acceptance of terms">
          <p>
            Welcome to ResumeATS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (these &quot;Terms&quot;) govern your access to and use of the ResumeATS website, services, and applications (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use the Service.
          </p>
        </Section>

        <Section title="2. Who can use our service (eligibility)">
          <p>
            To use our Service, you must be at least 16 years of age. By using the Service, you confirm that you meet this age requirement and are fully able and competent to enter into and comply with these Terms.
          </p>
        </Section>

        <Section title="3. Your ResumeATS account">
          <p>
            Some parts of our Service require you to create an account. If you register for an account, you commit to providing information that is accurate, up-to-date, and complete, and to keep this information current.
          </p>
          <p>
            Safeguarding your account login details (like your password) is your responsibility. All activities that happen under your account are also your responsibility. Please inform us immediately if you suspect any unauthorized access or use of your account.
          </p>
        </Section>

        <Section title="4. How you agree to use our service">
          <p>You commit to using our Service only for legal activities and in full agreement with these Terms. Specifically, you agree you will not:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Violate any applicable laws or regulations while using the Service.</li>
            <li>Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity through the Service.</li>
            <li>Disrupt or interfere with the Service, or any servers or networks connected to it.</li>
            <li>Try to gain unauthorized access to any part of the Service, or any related systems or networks.</li>
            <li>Transmit any viruses, malware, or other harmful code through the Service.</li>
            <li>Collect or harvest personally identifiable information of others through the Service without their consent.</li>
            <li>Use the Service for any commercial activities unless you have our express prior written permission.</li>
          </ul>
        </Section>

        <Section title="5. Your content and our license to use it">
          <p>
            Our Service enables you to create, upload, save, and share various materials such as resumes and personal details (collectively, &quot;User Content&quot;). While you keep full ownership of your User Content, by using the Service, you grant ResumeATS a non-exclusive, transferable, sub-licensable, royalty-free, worldwide license. This license allows us to use, copy, modify, create derivative works from, distribute, and publicly display/perform your User Content solely for the purpose of operating, providing, and improving the Service.
          </p>
          <p>By providing User Content, you confirm that:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>You either own your User Content or have all necessary rights to it, including the right to grant us the license outlined in these Terms.</li>
            <li>Your User Content does not infringe upon or violate the privacy rights, publicity rights, copyrights, or any other rights of any individual or entity.</li>
          </ul>
        </Section>

        <Section title="6. Subscriptions, payments, and renewals">
          <p>
            Access to certain premium features of our Service requires an active subscription. When you subscribe to a paid plan (e.g., Premium AI+), you agree to pay the applicable fees as outlined at the point of purchase. Generally, subscription fees are non-refundable, unless otherwise required by law or specified in these Terms (see our refund policy in the FAQ for more details).
          </p>
          <p>
            To ensure uninterrupted service, subscriptions automatically renew at the conclusion of each billing cycle (e.g., monthly or yearly). You can prevent auto-renewal by canceling your subscription through your account settings at any time before your current period ends.
          </p>
        </Section>

        <Section title="7. Our intellectual property rights">
          <p>
            The Service, including all its original content (text, graphics, logos, software), features, and functionality, is the exclusive property of ResumeATS and its licensors. It is protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws. You may not use our branding, logos, or other proprietary assets without our prior written consent.
          </p>
        </Section>

        <Section title="8. Important disclaimers (no warranties)">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm uppercase leading-relaxed tracking-wide text-amber-900 break-words dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:text-[0.85rem]">
            <p>
              Your use of the service is at your sole risk. The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent permitted by law, ResumeATS expressly disclaims all warranties of any kind, whether express or implied, including, but not limited to, the implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.
            </p>
          </div>
          <p>
            The Service may include AI-generated content. Such content is provided for informational and drafting purposes only, may be inaccurate or incomplete, and should be reviewed and verified by you before use or reliance.
          </p>
          <p>
            ResumeATS does not warrant that (i) the Service will meet your specific requirements; (ii) the Service will be uninterrupted, timely, secure, or error-free; (iii) the results that may be obtained from the use of the Service (including any AI-generated content) will be accurate, reliable, complete, or current; or (iv) any errors in the Service will be corrected.
          </p>
        </Section>

        <Section title="9. Our limitation of liability">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm uppercase leading-relaxed tracking-wide text-amber-900 break-words dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:text-[0.85rem]">
            <p>
              To the maximum extent permitted by applicable law, in no event shall ResumeATS, its affiliates, officers, directors, employees, agents, suppliers, or licensors be liable for any indirect, incidental, special, punitive, cover, or consequential damages (including, without limitation, damages for lost profits, revenue, goodwill, use, or content) however caused, under any theory of liability, including, without limitation, contract, tort, warranty, negligence, or otherwise, even if ResumeATS has been advised as to the possibility of such damages, resulting from:
            </p>
          </div>
          <ul className="list-disc space-y-2 pl-6">
            <li>(i) Your access to, use of, or inability to access or use the Service;</li>
            <li>(ii) Any conduct or content of any third party on or related to the Service;</li>
            <li>(iii) Any content (including AI-generated content) obtained from or through the Service;</li>
            <li>
              (iv) Unauthorized access, use, or alteration of your transmissions or User Content, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.
            </li>
          </ul>
        </Section>

        <Section title="10. Your responsibility to indemnify us">
          <p>
            You agree to defend, indemnify, and hold harmless ResumeATS and its affiliates, officers, directors, employees, and agents from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, and expenses (including but not limited to attorney&apos;s fees) arising from: (i) your use of and access to the Service; (ii) your violation of any term of these Terms; or (iii) your violation of any third-party right, including without limitation any copyright, property, or privacy right.
          </p>
        </Section>

        <Section title="11. Termination of your account or service access">
          <p>
            We reserve the right to terminate or suspend your account and your access to the Service at our sole discretion, without prior notice or liability, for any reason whatsoever, including, but not limited to, a breach of these Terms.
          </p>
          <p>
            If your account or access is terminated, your right to use the Service will end immediately. You can choose to terminate your own account at any time by discontinuing use of the Service or by using the account deletion feature within your account settings, if available.
          </p>
        </Section>

        <Section title="12. Updates to these terms">
          <p>
            We may update or modify these Terms from time to time. If we make changes that we consider material in our sole discretion, we will notify you (for example, by email or by posting a notice on our Service) at least thirty (30) days before the new terms become effective.
          </p>
          <p>
            Your continued use of the Service after any such revisions take effect constitutes your acceptance of the new Terms. If you do not agree with the new (or any) Terms, you must stop using the Service.
          </p>
        </Section>

        <Section title="13. Governing law and jurisdiction">
          <p>
            These Terms and your use of the Service will be governed by and construed in accordance with the laws of Georgia, without giving effect to any principles of conflicts of law. You agree that any legal action or proceeding arising out of or relating to these Terms or the Service shall be brought exclusively in the courts located in Tbilisi, Georgia, and you consent to the jurisdiction of and venue in such courts.
          </p>
          <p>
            Our failure to enforce any right or provision of these Terms will not be deemed a waiver of such right or provision. If any provision of these Terms is found by a court of competent jurisdiction to be invalid or unenforceable, the parties nevertheless agree that the court should endeavor to give effect to the parties&apos; intentions as reflected in the provision, and the other provisions of these Terms will remain in full force and effect.
          </p>
        </Section>

        <Section title="14. Questions about these terms">
          <p>
            Should you have any questions or concerns regarding these Terms of Service, please do not hesitate to contact us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="break-words text-blue-700 hover:underline dark:text-blue-300">
              {SUPPORT_EMAIL}
            </a>{' '}
            or{' '}
            <a href={`tel:${SUPPORT_PHONE_URI}`} className="text-blue-700 hover:underline dark:text-blue-300">
              {SUPPORT_PHONE_DISPLAY}
            </a>
            .
          </p>
        </Section>
      </motion.div>
    </div>
  );
};

export default TermsOfService;
