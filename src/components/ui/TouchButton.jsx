import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';

/**
 * TouchButton - A mobile-friendly button with larger touch targets
 * Follows WCAG touch target size recommendations (at least 48x48px)
 *
 * @param {Object} props - Component props
 * @param {string} [props.className] - Additional CSS classes
 * @param {React.ReactNode} props.children - Button content
 * @param {string} [props.variant] - Button style variant
 * @param {boolean} [props.disabled] - Whether the button is disabled
 * @param {string} [props.type] - Button type attribute
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.ariaLabel] - Accessible label for the button
 * @returns {JSX.Element} - TouchButton component
 */
const TouchButton = ({ children, className = '', ...props }) => {
  return (
    <Button
      className={`py-3 px-5 min-h-[48px] min-w-[48px] text-base ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
};

TouchButton.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'danger', 'ghost']),
  disabled: PropTypes.bool,
  type: PropTypes.string,
  onClick: PropTypes.func,
  ariaLabel: PropTypes.string
};

export default React.memo(TouchButton);
