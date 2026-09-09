import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import MobileBottomNav from './MobileBottomNav';
import OfflineNotification from '../ui/OfflineNotification';

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
  children,
  topNotice,
  toaster,
}) => {
  const { user } = useAuth();
  const showMobileNav = Boolean(user) && !hideMobileBottomNav && !adminMode;

  return (
    <div
      className="app-shell"
      data-admin-mode={adminMode ? 'true' : 'false'}
      data-mobile-nav={showMobileNav ? 'visible' : 'hidden'}
      data-focus-mode={hideMobileBottomNav ? 'true' : 'false'}
      data-support={supportVisible ? 'visible' : 'hidden'}
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
      {!adminMode && <Header />}
      <div className="app-body">
        {adminMode ? (
          <div className="app-main">{children}</div>
        ) : (
          <main className="app-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
        )}
        {!adminMode && <Footer compact={footerCompact} />}
      </div>
      {!adminMode && topNotice}
      {showMobileNav && <MobileBottomNav />}
      {!adminMode && <OfflineNotification />}
      {toaster}
    </div>
  );
};

export default AppShellFrame;
