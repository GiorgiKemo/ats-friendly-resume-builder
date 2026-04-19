import React, { memo, useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeInUp } from '../../utils/animationVariants';

/**
 * A reusable animated component that animates when scrolled into view
 * Performance optimized with useReducedMotion and memo
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child elements
 * @param {Object} props.variants - Animation variants (default: fadeInUp)
 * @param {string} props.className - Additional CSS classes
 * @param {number} props.delay - Delay before animation starts (in seconds)
 * @param {Object} props.viewportOptions - Options for the viewport detection
 * @returns {React.ReactElement} - The animated component
 */
const AnimatedElement = ({
  children,
  variants = fadeInUp,
  className = '',
  delay = 0,
  // as = 'div', // 'as' prop was unused
  viewportOptions = { once: true, amount: 0.2 },
  ...props
}) => {
  // Respect user's reduced motion preferences
  const prefersReducedMotion = useReducedMotion();

  // Use state to avoid hydration mismatch
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      setIsMobile(window.matchMedia('(max-width: 767px)').matches);
    }
  }, []);

  // Create custom variants with delay if specified
  const customVariants = useMemo(() => delay > 0
    ? {
      ...variants,
      visible: {
        ...variants.visible,
        transition: {
          ...variants.visible.transition,
          delay
        }
      }
    }
    : variants, [variants, delay]);

  const resolvedViewportOptions = useMemo(() => (isMobile
    ? {
      ...viewportOptions,
      amount: typeof viewportOptions.amount === 'number'
        ? Math.min(viewportOptions.amount, 0.1)
        : 0.1
    }
    : viewportOptions
  ), [isMobile, viewportOptions]);

  // Skip animation if user prefers reduced motion
  if (prefersReducedMotion) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={resolvedViewportOptions}
      variants={customVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(AnimatedElement);
