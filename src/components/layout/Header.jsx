import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';

const Header = () => {
  const { user, signOut, isAdmin } = useAuth();
  const { isPremium } = useSubscription();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(() => (
    typeof window !== 'undefined' ? window.scrollY > 32 : false
  ));
  const menuAreaRef = useRef(null);
  const headerRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const accountToggleRef = useRef(null);

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl || typeof ResizeObserver === 'undefined') return undefined;

    const syncHeaderChrome = () => {
      const height = Math.ceil(headerEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--app-chrome-top', `${height}px`);
    };

    syncHeaderChrome();
    const observer = new ResizeObserver(syncHeaderChrome);
    observer.observe(headerEl);
    window.addEventListener('resize', syncHeaderChrome);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeaderChrome);
    };
  }, [mobileMenuOpen, accountMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 32);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuAreaRef.current && !menuAreaRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (mobileMenuOpen) mobileToggleRef.current?.focus();
        if (accountMenuOpen) accountToggleRef.current?.focus();
        setMobileMenuOpen(false);
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, accountMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      closeMenus();
      navigate('/');
    } catch {
      closeMenus();
    }
  };

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const navLinkClass = (active) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
        : 'text-gray-700 hover:bg-white/80 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-blue-400'
    }`;

  const menuLinkClass =
    'block rounded-xl px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700';

  const menuPanelClass =
    'absolute right-0 top-full z-[120] mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800';

  const headerHasSurface = hasScrolled || mobileMenuOpen || accountMenuOpen;

  const renderAccountMenu = (id) => (
    <nav id={id} className={menuPanelClass} aria-label="Account">
      <Link to="/profile" className={menuLinkClass} onClick={closeMenus}>
        Account settings
      </Link>
      <Link to="/analytics" className={menuLinkClass} onClick={closeMenus}>
        Application insights
      </Link>
      <Link to={isPremium ? '/subscription/manage' : '/pricing'} className={menuLinkClass} onClick={closeMenus}>
        {isPremium ? 'Manage subscription' : 'Upgrade plan'}
      </Link>
      <Link to="/auto-apply" className={menuLinkClass} onClick={closeMenus}>
        Auto-apply (browser extension)
      </Link>
      <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
        Resume tips
      </Link>
      {isAdmin && (
        <Link to="/admin" className={menuLinkClass} onClick={closeMenus}>
          Admin
        </Link>
      )}
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left text-red-600 dark:text-red-400`}
        onClick={handleSignOut}
      >
        Sign out
      </button>
    </nav>
  );

  return (
    <header
      ref={headerRef}
      className={`app-header fixed inset-x-0 top-0 z-[110] border-b py-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out ${
        headerHasSurface
          ? 'border-gray-200 bg-white/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90 dark:border-slate-700 dark:bg-slate-800/95 dark:supports-[backdrop-filter]:bg-slate-800/90'
          : 'border-transparent bg-transparent shadow-none backdrop-blur-0'
      }`}
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 lg:gap-6">
            <Link to={user ? '/dashboard' : '/'} className="shrink-0 text-xl font-bold text-blue-600 dark:text-blue-400">
              ResumeATS
            </Link>

            <nav
              className="hidden md:flex items-center gap-1 rounded-xl border border-gray-200/80 bg-slate-50/90 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-900/40"
              aria-label="Main"
            >
              {user ? (
                <>
                  <Link to="/dashboard" aria-current={isActive('/dashboard') ? 'page' : undefined} className={navLinkClass(isActive('/dashboard'))}>
                    My resumes
                  </Link>
                  <Link to="/applications" aria-current={isActive('/applications') ? 'page' : undefined} className={navLinkClass(isActive('/applications'))}>
                    Applications
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/" aria-current={isActive('/') ? 'page' : undefined} className={navLinkClass(isActive('/'))}>
                    Home
                  </Link>
                  <Link to="/learn" aria-current={isActive('/learn') ? 'page' : undefined} className={navLinkClass(isActive('/learn'))}>
                    Resume tips
                  </Link>
                  <Link to="/pricing" aria-current={isActive('/pricing') ? 'page' : undefined} className={navLinkClass(isActive('/pricing'))}>
                    Pricing
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div ref={menuAreaRef} className="flex items-center gap-2">
            {user ? (
              <>
                <div className="hidden sm:block">
                  <Button as="link" to="/new" onClick={closeMenus} size="sm" className="min-h-10 px-4">
                    New resume
                  </Button>
                </div>

                <div className="relative hidden md:block">
                  <button
                    ref={accountToggleRef}
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      accountMenuOpen || isActive('/profile') || isActive('/pricing')
                        ? 'bg-gray-100 text-gray-900 dark:bg-slate-700 dark:text-slate-100'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    aria-expanded={accountMenuOpen}
                    aria-controls="header-account-menu"
                  >
                    Account
                    <svg
                      className={`h-4 w-4 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {accountMenuOpen && renderAccountMenu('header-account-menu')}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                  <Button as="link" to="/signin" onClick={closeMenus} variant="outline" size="sm" className="min-h-10 px-4">
                    Sign in
                  </Button>
                  <Button as="link" to="/signup" onClick={closeMenus} size="sm" className="min-h-10 px-4">
                    Sign up free
                  </Button>
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <button
              ref={mobileToggleRef}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-header-menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-header-menu"
            className="mt-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg md:hidden dark:border-slate-700 dark:bg-slate-800"
          >
            <nav className="flex flex-col gap-0.5" aria-label="Mobile menu">
              {user ? (
                <>
                  <Link to="/new" className={menuLinkClass} onClick={closeMenus}>
                    New resume
                  </Link>
                  <Link to="/dashboard" className={menuLinkClass} onClick={closeMenus}>
                    My resumes
                  </Link>
                  <Link to="/applications" className={menuLinkClass} onClick={closeMenus}>
                    Applications
                  </Link>
                  <Link to="/analytics" className={menuLinkClass} onClick={closeMenus}>
                    Application insights
                  </Link>
                  <Link to="/profile" className={menuLinkClass} onClick={closeMenus}>
                    Account settings
                  </Link>
                  <Link to={isPremium ? '/subscription/manage' : '/pricing'} className={menuLinkClass} onClick={closeMenus}>
                    {isPremium ? 'Manage subscription' : 'Upgrade plan'}
                  </Link>
                  <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
                    Resume tips
                  </Link>
                  <button
                    type="button"
                    className={`${menuLinkClass} w-full text-left text-red-600 dark:text-red-400`}
                    onClick={handleSignOut}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/" className={menuLinkClass} onClick={closeMenus}>
                    Home
                  </Link>
                  <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
                    Resume tips
                  </Link>
                  <Link to="/pricing" className={menuLinkClass} onClick={closeMenus}>
                    Pricing
                  </Link>
                  <div className="mt-2 grid grid-cols-2 gap-2 px-1 pb-1">
                      <Button as="link" to="/signin" onClick={closeMenus} variant="outline" size="sm" className="w-full">
                        Sign in
                      </Button>
                      <Button as="link" to="/signup" onClick={closeMenus} size="sm" className="w-full">
                        Sign up free
                      </Button>
                  </div>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
