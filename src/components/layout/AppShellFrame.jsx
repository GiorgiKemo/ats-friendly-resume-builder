import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import MobileBottomNav from './MobileBottomNav';
import OfflineNotification from '../ui/OfflineNotification';
import { PASSWORD_POLICY_WARNING_KEY, PASSWORD_POLICY_WARNING_MESSAGE } from '../../utils/authPasswordPolicy.js';

/**
 * Wraps routed content with viewport-aware chrome (fixed header, optional bottom nav).
 * Padding for safe areas and fixed UI is driven by CSS on .app-shell / .app-body.
 */
const AppShellFrame = ({
  hideMobileBottomNav,
  adminMode,
  footerCompact,
  supportVisible,
  isDark,
  consentPending,
  children,
  consentNotice,
  toaster,
  supportSlot,
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPasswordPolicyWarning, setShowPasswordPolicyWarning] = useState(false);
  const showMobileNav = Boolean(user) && !hideMobileBottomNav && !adminMode;

  useEffect(() => {
    let storedWarning = false;
    try {
      storedWarning = window.sessionStorage.getItem(PASSWORD_POLICY_WARNING_KEY) === '1';
      if (storedWarning) window.sessionStorage.removeItem(PASSWORD_POLICY_WARNING_KEY);
    } catch {
      // Route state still carries the warning when browser storage is unavailable.
    }
    if (location.state?.passwordPolicyWarning === true || storedWarning) setShowPasswordPolicyWarning(true);
  }, [location.key, location.state]);

  const dismissPasswordPolicyWarning = () => {
    setShowPasswordPolicyWarning(false);
    try {
      window.sessionStorage.removeItem(PASSWORD_POLICY_WARNING_KEY);
    } catch {
      // Dismissing the notice does not depend on browser storage.
    }
  };

  return (
    <div
      className="app-shell"
      data-admin-mode={adminMode ? 'true' : 'false'}
      data-mobile-nav={showMobileNav ? 'visible' : 'hidden'}
      data-focus-mode={hideMobileBottomNav ? 'true' : 'false'}
      data-support={supportVisible ? 'visible' : 'hidden'}
      data-consent={consentPending ? 'visible' : 'hidden'}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <a
        href="#main-content"
        className="app-skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      {!adminMode && <Header supportAvailable={supportVisible} />}
      <div className="app-body">
        {!adminMode && consentNotice}
        {showPasswordPolicyWarning && (
          <div
            role="region"
            aria-label="Password security notice"
            className="mx-auto mb-4 mt-3 flex w-full max-w-6xl flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <p role="status" aria-live="polite" className="text-sm">
              {PASSWORD_POLICY_WARNING_MESSAGE}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/forgot-password"
                onClick={dismissPasswordPolicyWarning}
                className="rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              >
                Reset password
              </Link>
              <button
                type="button"
                onClick={() => {
                  dismissPasswordPolicyWarning();
                  navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
                }}
                className="rounded-md px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {adminMode ? (
          <div className="app-main">{children}</div>
        ) : (
          <main className="app-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
        )}
        {!adminMode && <Footer compact={footerCompact} />}
      </div>
      {showMobileNav && <MobileBottomNav />}
      {!adminMode && <OfflineNotification />}
      {/* Support below toasts in DOM; toast host owns the higher z-index. */}
      {supportSlot}
      {toaster}
    </div>
  );
};

export default AppShellFrame;
