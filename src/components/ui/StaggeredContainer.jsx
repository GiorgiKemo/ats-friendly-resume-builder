import React, { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { staggerContainer } from '../../utils/animationVariants';

/**
 * A container component that staggers the animations of its children
 * Performance optimized with useReducedMotion and memo
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child elements to be staggered
 * @param {Object} props.variants - Animation variants (default: staggerContainer)
 * @param {string} props.className - Additional CSS classes
 * @param {number} props.staggerDelay - Delay between each child animation (in seconds)
 * @param {number} props.initialDelay - Initial delay before animations start (in seconds)
 * @returns {React.ReactElement} - The staggered container component
 */
const StaggeredContainer = ({
  children,
  variants = staggerContainer,
  className = '',
  staggerDelay = 0.05,  // Reduced from 0.1
  initialDelay = 0.1,   // Reduced from 0.2
  ...props
}) => {
  // Respect user's reduced motion preferences
  const prefersReducedMotion = useReducedMotion();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      setIsMobile(window.matchMedia('(max-width: 767px)').matches);
    }
  }, []);

  // Skip animation if user prefers reduced motion
  if (prefersReducedMotion) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  // Create custom variants with specified delays
  const customVariants = {
    ...variants,
    visible: {
      ...variants.visible,
      transition: {
        ...variants.visible.transition,
        staggerChildren: staggerDelay,
        delayChildren: initialDelay
      }
    }
  };

  if (isMobile) {
    // On mobile, animate on mount instead of whileInView
    return (
      <motion.div
        className={className}
        initial="hidden"
        animate="visible"
        variants={customVariants}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.05 }}
      variants={customVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(StaggeredContainer);
