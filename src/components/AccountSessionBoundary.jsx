import { Fragment, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Provider and page state belong to one identity. Token refreshes retain that
// state; account changes remount it before another user's content can render.
export default function AccountSessionBoundary({ children }) {
  const { user } = useAuth();
  const accountKey = user?.id || 'anonymous';
  const previousAccount = useRef(accountKey);

  useEffect(() => {
    if (previousAccount.current !== accountKey) toast.remove();
    previousAccount.current = accountKey;
  }, [accountKey]);

  return <Fragment key={accountKey}>{children}</Fragment>;
}

AccountSessionBoundary.propTypes = { children: PropTypes.node.isRequired };
