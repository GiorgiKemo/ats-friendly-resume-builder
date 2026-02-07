import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { staggerItem } from '../../utils/animationVariants';

/**
 * An item component to be used inside a StaggeredContainer
 * Performance optimized with memo
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child elements
 * @param {Object} props.variants - Animation variants (default: staggerItem)
 * @param {string} props.className - Additional CSS classes
 * @returns {React.ReactElement} - The staggered item component
 */
const StaggeredItem = ({
  children,
  variants = staggerItem,
  className = '',
  ...props
}) => {
  return (
    <motion.div
      className={className}
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(StaggeredItem);
