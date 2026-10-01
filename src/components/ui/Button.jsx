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
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';

  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 focus-visible:ring-blue-500',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 focus-visible:ring-slate-400',
    outline: 'border border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 text-slate-700 shadow-sm shadow-slate-900/[0.03] dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 focus-visible:ring-blue-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm focus-visible:ring-red-500',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-700 dark:text-slate-200 focus-visible:ring-slate-400',
  };

  const sizeStyles = {
    sm: 'text-sm px-4 py-2.5 min-h-[44px] min-w-[44px]',
    md: 'text-[15px] px-5 py-3 min-h-[48px] min-w-[48px]',
    lg: 'text-base px-6 py-3.5 min-h-[52px] min-w-[52px]',
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
      <motion.div tabIndex={-1} {...animationProps}>
        <Link
          to={to}
          className={buttonClasses}
          aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
          {...props}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : props.tabIndex}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault();
              return;
            }
            onClick?.(event);
          }}
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
