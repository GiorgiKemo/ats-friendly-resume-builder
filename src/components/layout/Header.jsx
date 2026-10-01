import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';
import Logo from '../brand/Logo';

// Small inline icon set for menus (decorative; every item has a text label).
const MENU_ICONS = {
  resumes: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  applications: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  plan: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z',
  autoapply: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  tips: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z',
  admin: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  new: 'M12 5v14M5 12h14',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  pricing: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  signout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

const MenuIcon = ({ name, className = 'h-[18px] w-[18px]' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={MENU_ICONS[name]} />
  </svg>
);

const Header = () => {
  const { user, signOut, isAdmin } = useAuth();
  const { isPremium } = useSubscription();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isFullWidthWorkspace = /^\/builder(\/|$)/.test(location.pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(() => (
    typeof window !== 'undefined' ? window.scrollY > 12 : false
  ));
  const menuAreaRef = useRef(null);
  const headerRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const accountToggleRef = useRef(null);

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl || typeof ResizeObserver === 'undefined') return undefined;

    // Only the bar itself reserves space; the open mobile sheet overlays content.
    const barEl = headerEl.querySelector('[data-header-bar]') || headerEl;
    const syncHeaderChrome = () => {
      const height = Math.ceil(barEl.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--app-chrome-top', `${height}px`);
    };

    syncHeaderChrome();
    const observer = new ResizeObserver(syncHeaderChrome);
    observer.observe(barEl);
    window.addEventListener('resize', syncHeaderChrome);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeaderChrome);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 12);
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
      if (mobileMenuOpen && headerRef.current && !headerRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

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

  // Lock page scroll behind the open mobile sheet.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileMenuOpen]);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const handleBrandClick = (event) => {
    closeMenus();

    // Preserve normal browser behavior for modified clicks (new tab/window,
    // context-menu navigation, etc.) while making a primary click useful even
    // when the current route is already the homepage.
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    event.preventDefault();
    navigate('/');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const mainLinks = user
    ? [
      { to: '/dashboard', label: 'My resumes', icon: 'resumes' },
      { to: '/applications', label: 'Applications', icon: 'applications' },
    ]
    : [
      { to: '/', label: 'Home', icon: 'home' },
      { to: '/learn', label: 'Resume tips', icon: 'tips' },
      { to: '/pricing', label: 'Pricing', icon: 'pricing' },
    ];

  const accountLinks = [
    { to: '/profile', label: 'Account settings', icon: 'settings' },
    { to: '/analytics', label: 'Application insights', icon: 'insights' },
    { to: isPremium ? '/subscription/manage' : '/pricing', label: isPremium ? 'Manage subscription' : 'Upgrade plan', icon: 'plan' },
    { to: '/auto-apply', label: 'Auto-apply (browser extension)', icon: 'autoapply' },
    { to: '/learn', label: 'Resume tips', icon: 'tips' },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: 'admin' }] : []),
  ];

  const initial = (user?.email || '?').trim().charAt(0).toUpperCase();
  const headerHasSurface = isHome || hasScrolled || mobileMenuOpen || accountMenuOpen || isFullWidthWorkspace;

  const menuLinkClass =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white';

  const renderAccountMenu = (id) => (
    <motion.nav
      id={id}
      aria-label="Account"
      className="absolute right-0 top-full z-[120] mt-3 w-72 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800"
      initial={{ opacity: 0, scale: 0.95, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -6 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <div className="mb-1 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-900/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">{initial}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.email}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{isPremium ? 'Premium plan' : 'Free plan'}</span>
        </span>
      </div>
      {accountLinks.map((item) => (
        <Link key={item.to + item.label} to={item.to} className={menuLinkClass} onClick={closeMenus}>
          <span className="text-slate-400 dark:text-slate-500"><MenuIcon name={item.icon} /></span>
          {item.label}
        </Link>
      ))}
      <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left !text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-950/40`}
        onClick={handleSignOut}
      >
        <MenuIcon name="signout" />
        Sign out
      </button>
    </motion.nav>
  );

  return (
    <header
      ref={headerRef}
      className={`app-header ${isHome ? 'app-header--home' : ''} fixed inset-x-0 top-0 z-[110] ${isFullWidthWorkspace ? '' : 'px-3 pt-3 sm:px-4'}`}
    >
      <div
        data-header-bar
        className={`transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out ${
          isFullWidthWorkspace
            ? 'w-full border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur-xl sm:px-6 dark:border-slate-700 dark:bg-slate-900/90'
            : `mx-auto max-w-6xl rounded-2xl border px-3 py-2 sm:px-4 ${headerHasSurface
              ? 'border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/[0.06] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/80'
              : 'border-transparent bg-transparent'}`
        }`}
      >
        <div className="header-bar-content flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 lg:gap-6">
            <Link
              to="/"
              className="group shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="ResumeATS home"
              onClick={handleBrandClick}
            >
              <Logo />
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {mainLinks.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={`relative rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                      active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="header-active-pill"
                        className={isHome
                          ? 'absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400'
                          : 'absolute inset-0 -z-10 rounded-xl bg-blue-50 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:ring-blue-400/20'}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div ref={menuAreaRef} className="flex items-center gap-1.5 sm:gap-2">
            {user ? (
              <>
                <div className="hidden sm:block">
                  <Button as="link" to="/new" onClick={closeMenus} size="sm" className="!min-h-10 px-4">
                    <MenuIcon name="new" className="h-4 w-4" />
                    New resume
                  </Button>
                </div>

                <div className="relative hidden md:block">
                  <button
                    ref={accountToggleRef}
                    type="button"
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-sm font-semibold transition-colors ${
                      accountMenuOpen || isActive('/profile')
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    aria-expanded={accountMenuOpen}
                    aria-controls="header-account-menu"
                    aria-label="Account"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white" aria-hidden="true">{initial}</span>
                    <svg
                      className={`h-4 w-4 text-slate-400 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {accountMenuOpen && renderAccountMenu('header-account-menu')}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  to="/signin"
                  onClick={closeMenus}
                  className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Sign in
                </Link>
                <Button as="link" to="/signup" onClick={closeMenus} size="sm" className="!min-h-10 px-4">
                  Sign up free
                </Button>
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.svg
                  key={isDark ? 'sun' : 'moon'}
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.2 }}
                >
                  {isDark ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  )}
                </motion.svg>
              </AnimatePresence>
            </button>

            <button
              ref={mobileToggleRef}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-header-menu"
            >
              <span className="relative block h-4 w-5" aria-hidden="true">
                <span className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${mobileMenuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
                <span className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${mobileMenuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-header-menu"
            className={`absolute inset-x-3 top-full mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/15 md:hidden dark:border-slate-700 dark:bg-slate-900 ${isFullWidthWorkspace ? 'mt-2' : ''}`}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {user && (
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/70">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white" aria-hidden="true">{initial}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user.email}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{isPremium ? 'Premium plan' : 'Free plan'}</span>
                </span>
              </div>
            )}
            <nav className="flex flex-col gap-0.5" aria-label="Mobile menu">
              {(user
                ? [{ to: '/new', label: 'New resume', icon: 'new' }, ...mainLinks, ...accountLinks.filter((item) => item.to !== '/admin' && item.to !== '/auto-apply')]
                : mainLinks
              ).map((item, index) => (
                <motion.div
                  key={item.to + item.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * index, duration: 0.2 }}
                >
                  <Link
                    to={item.to}
                    className={`${menuLinkClass} min-h-12 text-base ${isActive(item.to) ? '!bg-blue-50 !text-blue-700 dark:!bg-blue-500/10 dark:!text-blue-300' : ''}`}
                    onClick={closeMenus}
                    aria-current={isActive(item.to) ? 'page' : undefined}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><MenuIcon name={item.icon} /></span>
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              {user ? (
                <button
                  type="button"
                  className={`${menuLinkClass} mt-1 min-h-12 w-full text-left text-base !text-red-600 dark:!text-red-400`}
                  onClick={handleSignOut}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40"><MenuIcon name="signout" /></span>
                  Sign out
                </button>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button as="link" to="/signin" onClick={closeMenus} variant="outline" className="w-full">
                    Sign in
                  </Button>
                  <Button as="link" to="/signup" onClick={closeMenus} className="w-full">
                    Sign up free
                  </Button>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
