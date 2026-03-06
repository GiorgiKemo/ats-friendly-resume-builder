import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer } from '../utils/animationVariants';

const PrivacyPolicy = () => {
    return (
        <motion.div
            className="container mx-auto px-4 py-8 max-w-3xl"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
        >
            <motion.h1
                className="text-3xl font-bold mb-6 text-gray-800"
                variants={fadeInUp}
            >
                Privacy Policy
            </motion.h1>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Introduction</h2>
                <p className="text-gray-600 leading-relaxed">
                    Welcome to ResumeATS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your privacy
                    and ensuring that your personal information is handled in a safe and responsible manner.
                    This Privacy Policy explains how we collect, use, disclose, and safeguard your information
                    when you use our website and services.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Information We Collect</h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                    We collect information that you provide directly to us when using our services:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                    <li><strong>Account Information:</strong> When you create an account, we collect your name, email address, and password (securely hashed).</li>
                    <li><strong>Resume Data:</strong> The personal details, work experience, education, skills, and other information you enter into our resume builder.</li>
                    <li><strong>Payment Information:</strong> If you subscribe to a premium plan, payment processing is handled by Stripe. We do not store your full credit card details on our servers.</li>
                    <li><strong>Usage Data:</strong> We automatically collect information about how you interact with our services, including pages visited, features used, and time spent on the platform.</li>
                    <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers for improving your experience.</li>
                </ul>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">How We Use Your Information</h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                    We use the information we collect for the following purposes:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                    <li>To provide, maintain, and improve our resume building and AI generation services.</li>
                    <li>To process your transactions and manage your subscription.</li>
                    <li>To personalize your experience and deliver content relevant to your interests.</li>
                    <li>To communicate with you about your account, updates, and promotional offers (with your consent).</li>
                    <li>To detect, prevent, and address technical issues and security vulnerabilities.</li>
                    <li>To comply with legal obligations and enforce our terms of service.</li>
                </ul>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">AI-Generated Content</h2>
                <p className="text-gray-600 leading-relaxed">
                    When you use our AI Resume Generator, your job description inputs and preferences are sent to
                    third-party AI providers (such as OpenAI) to generate resume content. These inputs are used solely
                    for generating your resume and are not used to train AI models. We recommend reviewing all AI-generated
                    content before using it, as it may contain inaccuracies.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Data Storage and Security</h2>
                <p className="text-gray-600 leading-relaxed">
                    Your data is stored securely using Supabase, which provides enterprise-grade security including
                    encryption at rest and in transit. We implement appropriate technical and organizational measures
                    to protect your personal information against unauthorized access, alteration, disclosure, or
                    destruction. However, no method of transmission over the Internet or electronic storage is
                    100% secure, and we cannot guarantee absolute security.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Sharing Your Information</h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                    We do not sell your personal information. We may share your information only in the following circumstances:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                    <li><strong>Service Providers:</strong> With trusted third parties who assist us in operating our services (e.g., Stripe for payments, Supabase for data storage, OpenAI for AI features).</li>
                    <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process.</li>
                    <li><strong>Protection of Rights:</strong> To protect the rights, property, or safety of ResumeATS, our users, or others.</li>
                    <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with appropriate notice to you.</li>
                </ul>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Your Rights and Choices</h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                    You have the following rights regarding your personal information:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
                    <li><strong>Access:</strong> You can access and review your personal information through your account settings.</li>
                    <li><strong>Update:</strong> You can update or correct your information at any time via your profile page.</li>
                    <li><strong>Delete:</strong> You can request deletion of your account and associated data by contacting our support team.</li>
                    <li><strong>Export:</strong> You can export your resume data in PDF or DOCX format at any time.</li>
                    <li><strong>Opt-out:</strong> You can opt out of promotional communications by following the unsubscribe instructions in our emails.</li>
                </ul>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Cookies and Tracking</h2>
                <p className="text-gray-600 leading-relaxed">
                    We use essential cookies to maintain your session and remember your preferences. We do not use
                    third-party advertising cookies. Authentication tokens are stored securely in your browser to
                    keep you logged in.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Children&apos;s Privacy</h2>
                <p className="text-gray-600 leading-relaxed">
                    Our services are not intended for children under the age of 16. We do not knowingly collect
                    personal information from children under 16. If you believe we have collected information from
                    a child under 16, please contact us immediately.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Changes to This Policy</h2>
                <p className="text-gray-600 leading-relaxed">
                    We may update this Privacy Policy from time to time. We will notify you of any material changes
                    by posting the updated policy on this page and updating the &quot;Last updated&quot; date. Your continued
                    use of our services after any changes indicates your acceptance of the updated policy.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Contact Us</h2>
                <p className="text-gray-600 leading-relaxed">
                    If you have any questions about this Privacy Policy or our data practices, please contact us
                    at <a href="mailto:support@resumeats.com" className="text-blue-600 hover:underline">support@resumeats.com</a> or
                    visit our <Link to="/contact" className="text-blue-600 hover:underline">Contact page</Link>.
                </p>
            </motion.section>

            <motion.p className="text-sm text-gray-500 mt-8" variants={fadeInUp}>
                Last updated: March 6, 2026
            </motion.p>
        </motion.div>
    );
};

export default PrivacyPolicy;
