import { useEffect, useState } from 'react';
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
  const { isDark } = useAdminTheme();

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileNavigationOpen]);

  const handleNavigation = (section) => {
    onNavigate(section.id);
    setMobileNavigationOpen(false);
  };

  return (
    <div className={`admin-shell${isDark ? ' dark' : ''}`} data-admin-theme={isDark ? 'dark' : 'light'}>
      <button
        type="button"
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
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}

      <aside id="admin-navigation" className={`admin-sidebar ${mobileNavigationOpen ? 'is-open' : ''}`}>
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
