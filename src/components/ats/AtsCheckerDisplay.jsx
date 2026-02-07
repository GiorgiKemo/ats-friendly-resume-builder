import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import AtsIssueItem from './AtsIssueItem'; // Assuming .jsx extension is resolved
import { AtsSeverity } from '../../types/atsTypes'; // Import enum for severity comparison

const AtsCheckerDisplay = ({ issues, score = null, onCheckResume, isLoading = false, premiumUser = false }) => {
    const [jobDescription, setJobDescription] = useState('');
    const [showPremiumPrompt, setShowPremiumPrompt] = useState(false);

    const criticalIssues = issues.filter(issue => issue.severity === AtsSeverity.Critical).length;
    const highIssues = issues.filter(issue => issue.severity === AtsSeverity.High).length;
    const mediumIssues = issues.filter(issue => issue.severity === AtsSeverity.Medium).length;
    const lowIssues = issues.filter(issue => issue.severity === AtsSeverity.Low).length;

    const handleCheckResume = () => {
        if (jobDescription.trim() !== '' && !premiumUser) {
            setShowPremiumPrompt(true);
            return;
        }
        setShowPremiumPrompt(false);
        onCheckResume(jobDescription);
    };

    useEffect(() => {
        // If user becomes premium while prompt is shown, hide it.
        if (premiumUser && showPremiumPrompt) {
            setShowPremiumPrompt(false);
        }
    }, [premiumUser, showPremiumPrompt]);

    return (
        <div className="p-4 bg-white shadow-md rounded-lg">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">ATS Compatibility Check</h2>

            {/* Job Description Input - Premium Feature */}
            <div className="mb-4">
                <label htmlFor="job-description" className="block text-sm font-medium text-gray-700 mb-1">
                    Paste Job Description (Premium Feature for Keyword Analysis)
                </label>
                <textarea
                    id="job-description"
                    rows="4"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the full job description here to analyze keywords against your resume..."
                />
                {showPremiumPrompt && (
                    <p className="text-sm text-red-600 mt-1">
                        Keyword analysis with a job description is a premium feature. Please upgrade to use.
                    </p>
                )}
            </div>

            <button
                onClick={handleCheckResume}
                disabled={isLoading}
                className="w-full mb-4 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
                {isLoading ? 'Analyzing...' : 'Run ATS Check'}
            </button>

            {score !== null && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-xl font-semibold text-gray-700">Overall ATS Score:
                        <span className={`ml-2 font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {score}/100
                        </span>
                    </h3>
                    <p className="text-sm text-gray-600">
                        {criticalIssues > 0 && <span className="mr-2">{criticalIssues} Critical</span>}
                        {highIssues > 0 && <span className="mr-2">{highIssues} High</span>}
                        {mediumIssues > 0 && <span className="mr-2">{mediumIssues} Medium</span>}
                        {lowIssues > 0 && <span className="mr-2">{lowIssues} Low</span>}
                        {issues.length === 0 && <span>No issues found. Great job!</span>}
                    </p>
                </div>
            )}

            {issues.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">Detected Issues & Suggestions:</h3>
                    {issues.map((issue) => (
                        <AtsIssueItem key={issue.ruleId} issue={issue} />
                    ))}
                </div>
            )}
            {issues.length === 0 && score !== null && !isLoading && (
                <p className="text-green-600 font-semibold">No compatibility issues detected based on the current checks!</p>
            )}
        </div>
    );
};

AtsCheckerDisplay.propTypes = {
    issues: PropTypes.arrayOf(
        PropTypes.shape({
            ruleId: PropTypes.string.isRequired,
            description: PropTypes.string.isRequired,
            severity: PropTypes.oneOf(['Critical', 'High', 'Medium', 'Low']).isRequired,
            suggestion: PropTypes.string.isRequired,
            impactExplanation: PropTypes.string.isRequired,
            category: PropTypes.string.isRequired,
            tier: PropTypes.oneOf(['Basic', 'Premium']).isRequired,
        })
    ).isRequired,
    score: PropTypes.number,
    onCheckResume: PropTypes.func.isRequired,
    isLoading: PropTypes.bool,
    premiumUser: PropTypes.bool,
};



export default AtsCheckerDisplay;