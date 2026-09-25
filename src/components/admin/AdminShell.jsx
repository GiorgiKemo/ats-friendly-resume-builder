import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminTheme } from './AdminThemeProvider';
import './admin-shell.css';

const navigation = [
  { id: 'overview', label: 'Overview', available: true },
  { id: 'users', label: 'Users', available: true },
  { id: 'errors', label: 'Client errors', available: true },
  { id: 'analytics', label: 'Analytics', available: true },
  { id: 'admins', label: 'Admin access', available: true },
  { id: 'subscriptions', label: 'Subscriptions', available: true },
  { id: 'support', label: 'Support', available: true },
  { id: 'jobs', label: 'AI & Jobs', available: true },
  { id: 'feedback', label: 'Feedback', available: true },
  { id: 'audit', label: 'Audit log', available: true },
  { id: 'settings', label: 'Settings', available: true },
];

const themeOptions = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const themeIcons = {
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.5 5.25h15v10.5h-15zM9.75 17.25h4.5" />
    </svg>
  ),
};

const AdminThemeSelector = () => {
  const { preference, setPreference } = useAdminTheme();

  return (
    <div className="admin-theme-selector" aria-label="Admin theme">
      {themeOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className={preference === option.id ? 'is-selected' : ''}
          aria-pressed={preference === option.id}
          aria-label={option.label}
          onClick={() => setPreference(option.id)}
        >
          {themeIcons[option.id]}
        </button>
      ))}
    </div>
  );
};

const AdminShell = ({ activeSection, onNavigate, children }) => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileToggleRef = useRef(null);
  const mobileSidebarRef = useRef(null);
  const { isDark, setPreference } = useAdminTheme();

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstNavigationItem = () => {
      mobileSidebarRef.current?.querySelector(focusableSelector)?.focus();
    };
    const animationFrame = window.requestAnimationFrame(focusFirstNavigationItem);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigationOpen(false);
        window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableItems = Array.from(mobileSidebarRef.current?.querySelectorAll(focusableSelector) || []);
      if (!focusableItems.length) {
        event.preventDefault();
        return;
      }

      const firstItem = focusableItems[0];
      const lastItem = focusableItems[focusableItems.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileNavigationOpen]);

  const closeMobileNavigation = (restoreFocus = false) => {
    setMobileNavigationOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
    }
  };

  const handleNavigation = (section) => {
    onNavigate(section.id);
    closeMobileNavigation(true);
  };

  return (
    <div className={`admin-shell${isDark ? ' dark' : ''}`} data-admin-theme={isDark ? 'dark' : 'light'}>
      <button
        type="button"
        ref={mobileToggleRef}
        className="admin-mobile-toggle"
        aria-expanded={mobileNavigationOpen}
        aria-controls="admin-navigation"
        onClick={() => setMobileNavigationOpen((open) => !open)}
      >
        {mobileNavigationOpen ? 'Close menu' : 'Admin menu'}
      </button>

      {mobileNavigationOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close admin menu"
          onClick={() => closeMobileNavigation(true)}
        />
      )}

      <aside
        id="admin-navigation"
        ref={mobileSidebarRef}
        className={`admin-sidebar ${mobileNavigationOpen ? 'is-open' : ''}`}
        role={mobileNavigationOpen ? 'dialog' : undefined}
        aria-modal={mobileNavigationOpen ? 'true' : undefined}
        aria-label={mobileNavigationOpen ? 'Admin navigation' : undefined}
      >
        <Link to="/" className="admin-brand" aria-label="ResumeATS home">
          <svg className="admin-brand-mark" viewBox="0 0 384 512" aria-hidden="true">
            <path fill="currentColor" d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm64 236c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-64c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-72v8c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12zm96-114.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z" />
          </svg>
          <span className="admin-brand-name">ResumeATS</span>
        </Link>
        <Link to="/" className="admin-back-link">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to website
        </Link>

        <nav className="admin-nav" aria-label="Admin sections">
          {navigation.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? 'is-active' : ''}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => handleNavigation(section)}
            >
              <span>{section.label}</span>
              {!section.available && <span className="admin-nav-status">Planned</span>}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <AdminThemeSelector />
        </div>
      </aside>

      <main className="admin-main" id="main-content" tabIndex={-1}>
        <header className="admin-header">
          <div className="admin-header-title">Control center</div>
          <div className="admin-header-meta">
            <span className="admin-data-label">{import.meta.env.DEV ? 'Development environment' : 'Live data where connected'}</span>
            <button
              type="button"
              className="admin-theme-toggle"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setPreference(isDark ? 'light' : 'dark')}
            >
              {isDark ? themeIcons.light : themeIcons.dark}
            </button>
          </div>
        </header>
        <div className="admin-content" key={activeSection}>{children}</div>
      </main>
    </div>
  );
};

export default AdminShell;
