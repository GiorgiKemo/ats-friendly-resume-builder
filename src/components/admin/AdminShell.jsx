import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { useAdminTheme } from './AdminThemeProvider';
import { AdminIcon } from './AdminIcons';
import { ADMIN_NAVIGATION_GROUPS, ADMIN_NAV_LABELS, ADMIN_PAGE_META, ADMIN_SECTION_ICONS } from './adminSections';
import './admin-shell.css';

const themeOptions = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

const springTransition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 };

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
          title={option.label}
          onClick={() => setPreference(option.id)}
        >
          {preference === option.id && (
            <motion.span layoutId="admin-theme-pill" className="admin-theme-pill" transition={springTransition} aria-hidden="true" />
          )}
          <AdminIcon name={option.icon} />
        </button>
      ))}
    </div>
  );
};

export const AdminPageHeader = ({ section, actions = null }) => {
  const meta = ADMIN_PAGE_META[section] || ADMIN_PAGE_META.overview;

  return (
    <div className="admin-page-header">
      <div className={`admin-page-icon admin-tone-${meta.tone}`} aria-hidden="true">
        <AdminIcon name={ADMIN_SECTION_ICONS[section] || 'overview'} />
      </div>
      <div className="admin-page-heading">
        <h1>{meta.title}</h1>
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
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
    <MotionConfig reducedMotion="user">
      <div className={`admin-shell${isDark ? ' dark' : ''}`} data-admin-theme={isDark ? 'dark' : 'light'}>
        <button
          type="button"
          ref={mobileToggleRef}
          className="admin-mobile-toggle"
          aria-expanded={mobileNavigationOpen}
          aria-controls="admin-navigation"
          onClick={() => setMobileNavigationOpen((open) => !open)}
        >
          <AdminIcon name={mobileNavigationOpen ? 'close' : 'menu'} />
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
            <span className="admin-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 384 512" aria-hidden="true">
                <path fill="currentColor" d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm64 236c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-64c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-72v8c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12zm96-114.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z" />
              </svg>
            </span>
            <span className="admin-brand-text">
              <span className="admin-brand-name">ResumeATS</span>
              <span className="admin-brand-tag">Admin</span>
            </span>
          </Link>
          <Link to="/" className="admin-back-link">
            <AdminIcon name="arrowLeft" />
            Back to website
          </Link>

          <nav className="admin-nav" aria-label="Admin sections">
            {ADMIN_NAVIGATION_GROUPS.map((group) => (
              <div key={group.id} className="admin-nav-group" role="group" aria-labelledby={`admin-nav-group-${group.id}`}>
                <p className="admin-nav-group-label" id={`admin-nav-group-${group.id}`}>{group.label}</p>
                {group.items.map((section) => {
                  const active = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={active ? 'is-active' : ''}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => handleNavigation(section)}
                    >
                      {active && (
                        <motion.span layoutId="admin-nav-pill" className="admin-nav-pill" transition={springTransition} aria-hidden="true" />
                      )}
                      <AdminIcon name={section.icon} className="admin-nav-icon" />
                      <span className="admin-nav-label">{section.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <p>Appearance</p>
            <AdminThemeSelector />
          </div>
        </aside>

        <main className="admin-main" id="main-content" tabIndex={-1}>
          <header className="admin-header">
            <div className="admin-header-trail">
              <div className="admin-header-title">Control center</div>
              <svg className="admin-header-separator" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="admin-header-crumb">{ADMIN_NAV_LABELS[activeSection] || 'Overview'}</span>
            </div>
            <div className="admin-header-meta">
              <span className="admin-data-label">
                <span className="admin-live-dot" aria-hidden="true" />
                {import.meta.env.DEV ? 'Development environment' : 'Live data where connected'}
              </span>
              <button
                type="button"
                className="admin-theme-toggle"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setPreference(isDark ? 'light' : 'dark')}
              >
                <motion.span
                  key={isDark ? 'sun' : 'moon'}
                  className="admin-theme-toggle-icon"
                  initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AdminIcon name={isDark ? 'sun' : 'moon'} />
                </motion.span>
              </button>
            </div>
          </header>
          <motion.div
            className="admin-content"
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  );
};

export default AdminShell;
