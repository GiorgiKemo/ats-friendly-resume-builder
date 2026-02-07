import React from 'react';
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
                    Welcome to our Privacy Policy page. This page is currently a placeholder.
                    The full Privacy Policy will be available here soon. We are committed to protecting your privacy
                    and ensuring that your personal information is handled in a safe and responsible manner.
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Information We Collect</h2>
                <p className="text-gray-600 leading-relaxed">
                    (Details about the types of information collected will be provided here.)
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">How We Use Your Information</h2>
                <p className="text-gray-600 leading-relaxed">
                    (Details on how collected information is used will be provided here.)
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Sharing Your Information</h2>
                <p className="text-gray-600 leading-relaxed">
                    (Details on information sharing practices will be provided here.)
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Security</h2>
                <p className="text-gray-600 leading-relaxed">
                    (Information about security measures will be provided here.)
                </p>
            </motion.section>

            <motion.section className="mb-6" variants={fadeInUp}>
                <h2 className="text-2xl font-semibold mb-3 text-gray-700">Contact Us</h2>
                <p className="text-gray-600 leading-relaxed">
                    If you have any questions about this Privacy Policy, please contact us.
                    (Contact information will be provided here.)
                </p>
            </motion.section>

            <motion.p className="text-sm text-gray-500 mt-8" variants={fadeInUp}>
                Last updated: [Date to be filled]
            </motion.p>
        </motion.div>
    );
};

export default PrivacyPolicy;