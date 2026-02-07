import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const PasswordStrengthIndicator = ({ password }) => {
    const [strength, setStrength] = useState({
        level: 'none', // none, weak, medium, strong
        label: '',
        color: 'bg-gray-200 dark:bg-gray-600',
        value: 0, // Represents strength percentage (0, 33, 66, 100)
    });
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (!password) {
            setStrength({
                level: 'none',
                label: '',
                color: 'bg-gray-200 dark:bg-gray-600',
                value: 0,
            });
            setSuggestions([]);
            return;
        }

        let score = 0;
        const currentSuggestions = [];

        // Length
        if (password.length >= 8) {
            score++;
        } else {
            currentSuggestions.push('Use at least 8 characters.');
        }
        if (password.length >= 12) {
            score++; // Extra point for longer passwords
        }

        // Uppercase
        if (/[A-Z]/.test(password)) {
            score++;
        } else {
            currentSuggestions.push('Add uppercase letters (A-Z).');
        }

        // Lowercase
        if (/[a-z]/.test(password)) {
            score++;
        } else {
            currentSuggestions.push('Add lowercase letters (a-z).');
        }

        // Numbers
        if (/[0-9]/.test(password)) {
            score++;
        } else {
            currentSuggestions.push('Add numbers (0-9).');
        }

        // Special characters
        if (/[^A-Za-z0-9]/.test(password)) {
            score++;
        } else {
            currentSuggestions.push('Add special characters (e.g., !@#$%).');
        }

        // Determine strength level, color, and value based on score
        let newStrengthData = { level: 'weak', label: 'Weak', color: 'bg-red-500 dark:bg-red-400', value: 33 };
        if (password && score === 0) { // Password exists but meets no criteria
            newStrengthData = { level: 'weak', label: 'Very Weak', color: 'bg-red-500 dark:bg-red-400', value: 10 }; // Minimal indication
        } else if (score >= 5) {
            newStrengthData = { level: 'strong', label: 'Strong', color: 'bg-green-500 dark:bg-green-400', value: 100 };
        } else if (score >= 3) {
            newStrengthData = { level: 'medium', label: 'Medium', color: 'bg-yellow-500 dark:bg-yellow-400', value: 66 };
        }
        // Default is 'weak' with value 33 if score is 1 or 2.

        setStrength(newStrengthData);
        if (newStrengthData.level !== 'strong') {
            setSuggestions(currentSuggestions.slice(0, 2)); // Show max 2 suggestions
        } else {
            setSuggestions([]);
        }

    }, [password]);

    if (!password) {
        return null; // Don't render anything if there's no password input yet
    }

    return (
        <motion.div
            className="mt-2 mb-3"
            aria-live="polite"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 mb-1">
                <motion.div
                    className={`h-2.5 rounded-full ${strength.color} w-full`} // Bar is w-full, visual width by scaleX
                    style={{ transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: strength.value / 100 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    role="progressbar"
                    aria-valuenow={strength.value}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-label={`Password strength: ${strength.label}`}
                />
            </div>
            <div className="flex justify-between items-center">
                <p className={`text-sm font-medium ${strength.level === 'strong' ? 'text-green-600 dark:text-green-400' :
                    strength.level === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        strength.level === 'weak' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                    {strength.label}
                </p>
            </div>
            {suggestions.length > 0 && strength.level !== 'strong' && (
                <ul className="mt-1 list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                    {suggestions.map((suggestion, index) => (
                        <motion.li
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 + 0.2 }}
                        >
                            {suggestion}
                        </motion.li>
                    ))}
                </ul>
            )}
        </motion.div>
    );
};

export default PasswordStrengthIndicator;