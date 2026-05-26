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
  footerCompact,
  isDark,
  children,
  toaster,
}) => {
  const { user } = useAuth();
  const showMobileNav = Boolean(user) && !hideMobileBottomNav;

  return (
    <div
      className="app-shell"
      data-mobile-nav={showMobileNav ? 'visible' : 'hidden'}
      data-focus-mode={hideMobileBottomNav ? 'true' : 'false'}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Header />
      <div className="app-body">
        <main className="app-main" id="main-content">
          {children}
        </main>
        <Footer compact={footerCompact} />
      </div>
      {showMobileNav && <MobileBottomNav />}
      <OfflineNotification />
      {toaster}
    </div>
  );
};

export default AppShellFrame;
