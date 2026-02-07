import React from 'react';
import PropTypes from 'prop-types';

const AtsIssueItem = ({ issue }) => {
    const severityClasses = {
        Critical: 'bg-red-100 border-red-500 text-red-700',
        High: 'bg-orange-100 border-orange-500 text-orange-700',
        Medium: 'bg-yellow-100 border-yellow-500 text-yellow-700',
        Low: 'bg-blue-100 border-blue-500 text-blue-700',
    };

    return (
        <div
            className={`p-4 mb-3 border-l-4 rounded-md ${severityClasses[issue.severity] || 'bg-gray-100 border-gray-500'
                }`}
        >
            <p className="font-bold">
                {issue.severity}: {issue.description}
            </p>
            <p className="text-sm mt-1">
                <span className="font-semibold">Impact:</span> {issue.impactExplanation}
            </p>
            <p className="text-sm mt-1">
                <span className="font-semibold">Suggestion:</span> {issue.suggestion}
            </p>
            <p className="text-xs mt-2 text-gray-600">
                Category: {issue.category} | Rule ID: {issue.ruleId} | Tier: {issue.tier}
            </p>
        </div>
    );
};

AtsIssueItem.propTypes = {
    issue: PropTypes.shape({
        ruleId: PropTypes.string.isRequired,
        description: PropTypes.string.isRequired,
        severity: PropTypes.oneOf(['Critical', 'High', 'Medium', 'Low']).isRequired,
        suggestion: PropTypes.string.isRequired,
        impactExplanation: PropTypes.string.isRequired,
        category: PropTypes.string.isRequired,
        tier: PropTypes.oneOf(['Basic', 'Premium']).isRequired,
    }).isRequired,
};

export default AtsIssueItem;