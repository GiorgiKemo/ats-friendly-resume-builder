import { useEffect, useRef, useState } from 'react';
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
          onClick={() => setPreference(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const AdminShell = ({ activeSection, onNavigate, children }) => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileToggleRef = useRef(null);
  const mobileSidebarRef = useRef(null);
  const { isDark } = useAdminTheme();

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
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">R</span>
          <span>ResumeATS</span>
        </div>

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
          <p>Theme</p>
          <AdminThemeSelector />
        </div>
      </aside>

      <main className="admin-main" id="main-content" tabIndex={-1}>
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">ResumeATS / Administration</p>
            <h1>Control center</h1>
          </div>
          <div className="admin-header-meta">
            <span className="admin-live-dot" aria-hidden="true" />
            <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
            <span className="admin-data-label">Live data where connected</span>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
};

export default AdminShell;
