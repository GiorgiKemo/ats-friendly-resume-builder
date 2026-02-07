import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { hoverScale, tapScale } from '../../utils/animationVariants';

/**
 * TouchExternalLink - A mobile-friendly external link with larger touch targets
 * Follows WCAG touch target size recommendations (at least 48x48px)
 *
 * @param {Object} props - Component props
 * @param {string} props.href - Link destination
 * @param {React.ReactNode} props.children - Link content
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.animate=true] - Whether to apply animations
 * @param {string} [props.ariaLabel] - Accessible label for the link
 * @param {boolean} [props.openInNewTab=true] - Whether to open the link in a new tab
 * @returns {JSX.Element} - TouchExternalLink component
 */
const TouchExternalLink = ({
  href,
  children,
  className = '',
  animate = true,
  ariaLabel,
  openInNewTab = true,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
  const touchStyles = 'min-h-[48px] min-w-[48px] px-4 py-2';
  
  const linkClasses = `${baseStyles} ${touchStyles} ${className}`;

  // Animation props - only apply if animate is true
  const animationProps = animate ? {
    whileHover: hoverScale,
    whileTap: tapScale,
    transition: { duration: 0.2 }
  } : {};

  // New tab props
  const newTabProps = openInNewTab ? {
    target: '_blank',
    rel: 'noopener noreferrer'
  } : {};

  return (
    <motion.div {...animationProps}>
      <a
        href={href}
        className={linkClasses}
        aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
        {...newTabProps}
        {...props}
      >
        {children}
      </a>
    </motion.div>
  );
};

TouchExternalLink.propTypes = {
  href: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  animate: PropTypes.bool,
  ariaLabel: PropTypes.string,
  openInNewTab: PropTypes.bool
};

export default React.memo(TouchExternalLink);
