import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { hoverScale, tapScale } from '../../utils/animationVariants';

/**
 * Button - A versatile button component with multiple variants and sizes
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Button content
 * @param {string} [props.variant='primary'] - Button style variant
 * @param {string} [props.size='md'] - Button size
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.disabled=false] - Whether the button is disabled
 * @param {string} [props.type='button'] - Button type attribute
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.as] - Render as different element ('link')
 * @param {string} [props.to] - Link destination when as="link"
 * @param {boolean} [props.animate=true] - Whether to apply animations
 * @param {string} [props.ariaLabel] - Accessible label for the button
 * @returns {JSX.Element} - Button component
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  onClick,
  as,
  to,
  animate = true,
  ariaLabel,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 focus:ring-blue-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-400',
  };

  const sizeStyles = {
    sm: 'text-sm px-4 py-3 rounded min-h-[48px] min-w-[48px]',
    md: 'text-base px-5 py-3 rounded-md min-h-[48px] min-w-[48px]',
    lg: 'text-lg px-6 py-3 rounded-lg min-h-[48px] min-w-[48px]',
  };

  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

  const buttonClasses = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`;

  // Animation props - only apply if animate is true and not disabled
  const animationProps = (animate && !disabled) ? {
    whileHover: hoverScale,
    whileTap: tapScale,
    transition: { duration: 0.2 }
  } : {};

  // If the button is a link, render a Link component
  if (as === 'link' && to) {
    return (
      <motion.div {...animationProps}>
        <Link
          to={to}
          className={buttonClasses}
          aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
          role="button"
          {...props}
        >
          {children}
        </Link>
      </motion.div>
    );
  }

  // Otherwise, render a regular button
  return (
    <motion.button
      type={type}
      className={buttonClasses}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      {...animationProps}
      {...props}
    >
      {children}
    </motion.button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  disabled: PropTypes.bool,
  type: PropTypes.string,
  onClick: PropTypes.func,
  as: PropTypes.string,
  to: PropTypes.string,
  animate: PropTypes.bool,
  ariaLabel: PropTypes.string
};

export default React.memo(Button);
