import React from 'react';
import PropTypes from 'prop-types';

const SupportChannelIcon = ({ kind, className = 'h-5 w-5' }) => {
  const commonProps = {
    className,
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (kind === 'email') {
    return (
      <svg {...commonProps}>
        <path d="M3 6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 17.25V6.75zm1.28-.53L12 11.25l7.72-5.03" />
      </svg>
    );
  }

  if (kind === 'phone') {
    return (
      <svg {...commonProps}>
        <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372a1.5 1.5 0 00-1.11-1.448l-4.178-1.044a1.5 1.5 0 00-1.566.528l-.918 1.225a12.034 12.034 0 01-5.112-5.112l1.225-.918a1.5 1.5 0 00.528-1.566L8.57 3.36A1.5 1.5 0 007.122 2.25H5.75A2.25 2.25 0 003.5 4.5v2.25z" />
      </svg>
    );
  }

  if (kind === 'whatsapp') {
    return (
      <svg {...commonProps}>
        <path d="M20.5 11.5a8.5 8.5 0 01-12.58 7.46L4 20l1.04-3.78A8.5 8.5 0 1120.5 11.5z" />
        <path d="M8.5 8.75c.2-.45.42-.47.78-.47h.38c.14 0 .3.04.42.32l.58 1.38c.08.2.05.35-.08.52l-.42.55c-.13.16-.08.3 0 .44.25.44.63.8 1.06 1.06.14.08.28.1.44-.03l.53-.43c.17-.14.32-.16.52-.08l1.37.63c.28.13.32.25.3.39l-.1.72c-.03.21-.13.4-.3.51-.31.21-.8.42-1.38.34-1.04-.14-2.3-.82-3.3-1.82-1-.99-1.67-2.26-1.81-3.3-.08-.58.13-1.07.34-1.38.11-.16.3-.26.51-.29z" />
      </svg>
    );
  }

  if (kind === 'address') {
    return (
      <svg {...commonProps}>
        <path d="M20 10.5c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 1116 0z" />
        <circle cx="12" cy="10.5" r="2.5" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M20.25 11.5a8.25 8.25 0 01-8.25 8.25 8.2 8.2 0 01-3.72-.88L4 20l1.13-4.07A8.25 8.25 0 1120.25 11.5z" />
      <path d="M8.5 10h7M8.5 13h4.5" />
    </svg>
  );
};

SupportChannelIcon.propTypes = {
  kind: PropTypes.oneOf(['email', 'phone', 'whatsapp', 'address', 'contact']).isRequired,
  className: PropTypes.string,
};

export default SupportChannelIcon;
