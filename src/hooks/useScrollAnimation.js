import { useInView } from 'framer-motion';
import { useRef } from 'react';

/**
 * Custom hook to handle scroll animations with Framer Motion
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Threshold for when the element is considered in view (0-1)
 * @param {boolean} options.once - Whether the animation should only trigger once
 * @param {number} options.amount - Amount of the element that needs to be in view (0-1 or "some", "all")
 * @returns {Array} - [ref, isInView] - Ref to attach to the element and boolean indicating if in view
 */
export function useScrollAnimation({
  // threshold = 0.2, // threshold was unused, useInView uses 'amount'
  once = true,
  amount = 0.5
} = {}) {
  const ref = useRef(null);
  const isInView = useInView(ref, {
    once,
    amount
  });

  return [ref, isInView];
}
