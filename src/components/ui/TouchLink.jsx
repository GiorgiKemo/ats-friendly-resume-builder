import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { hoverScale, tapScale } from '../../utils/animationVariants';

/**
 * TouchLink - A mobile-friendly link with larger touch targets
 * Follows WCAG touch target size recommendations (at least 48x48px)
 *
 * @param {Object} props - Component props
 * @param {string} props.to - Link destination
 * @param {React.ReactNode} props.children - Link content
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.animate=true] - Whether to apply animations
 * @param {string} [props.ariaLabel] - Accessible label for the link
 * @returns {JSX.Element} - TouchLink component
 */
const TouchLink = ({
  to,
  children,
  className = '',
  animate = true,
  ariaLabel,
  disabled = false,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
  const touchStyles = 'min-h-[48px] min-w-[48px] px-4 py-2';

  const linkClasses = `${baseStyles} ${touchStyles} ${className}`;

  // Animation props - only apply if animate is true and not disabled
  const animationProps = animate && !disabled ? {
    whileHover: hoverScale,
    whileTap: tapScale,
    transition: { duration: 0.2 }
  } : {};

  if (disabled) {
    return (
      <motion.div {...animationProps}>
        <span
          className={linkClasses}
          aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
          aria-disabled="true"
          role="link"
          tabIndex={-1}
        >
          {children}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div {...animationProps}>
      <Link
        to={to}
        className={linkClasses}
        aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
        {...props}
      >
        {children}
      </Link>
    </motion.div>
  );
};

TouchLink.propTypes = {
  to: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  animate: PropTypes.bool,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool
};

export default React.memo(TouchLink);
