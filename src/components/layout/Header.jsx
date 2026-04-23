import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx';
import { useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';

const Header = () => {
  const { user, signOut } = useAuth();
  const { isPremium } = useSubscription();
  const { updateCurrentResume } = useResume();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const menuAreaRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuAreaRef.current && !menuAreaRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setOpenMenu(null);
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

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const isCreateActive = ['/quick-resume', '/builder', '/ai-generator'].some(isActive);
  const isAccountActive = ['/profile', '/pricing'].some(isActive);

  const navLinkClass = (active) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
      : 'text-gray-700 hover:bg-white/80 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-blue-400'
  }`;

  const menuButtonClass = (active) => `inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
      : 'text-gray-700 hover:bg-gray-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400'
  }`;

  const menuPanelClass = 'absolute right-0 top-full z-[120] mt-3 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800';

  const menuLinkClass = 'block rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700';
  const menuSectionLabelClass = 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500';

  const toggleMenu = (menuName) => {
    setOpenMenu((current) => current === menuName ? null : menuName);
  };

  const handleCreateResumeClick = () => {
    updateCurrentResume(initialResumeState, false, true);
    closeMenus();
    navigate('/builder', { state: { forceBlank: true } });
  };

  const renderCreateMenu = () => (
    <div className={menuPanelClass}>
      <div className={menuSectionLabelClass}>Recommended</div>
      <Link to="/quick-resume" className={menuLinkClass} onClick={closeMenus}>
        Quick Resume
      </Link>
      <div className="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
        Fastest path when you already have a job posting.
      </div>

      <div className={menuSectionLabelClass}>Build</div>
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left`}
        onClick={handleCreateResumeClick}
      >
        Advanced Builder
      </button>
      <Link to="/ai-generator" className={menuLinkClass} onClick={closeMenus}>
        AI Generator
      </Link>

      <div className={menuSectionLabelClass}>Learn</div>
      <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
        ATS Guide
      </Link>
    </div>
  );

  const renderAccountMenu = () => (
    <div className={menuPanelClass}>
      <div className={menuSectionLabelClass}>Account</div>
      <Link to="/profile" className={menuLinkClass} onClick={closeMenus}>
        Account Settings
      </Link>
      <Link to="/pricing" className={menuLinkClass} onClick={closeMenus}>
        {isPremium ? 'Manage Subscription' : 'Upgrade Plan'}
      </Link>
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left text-red-600 dark:text-red-400`}
        onClick={handleSignOut}
      >
        Sign Out
      </button>
    </div>
  );

  const renderCompactMenu = () => (
    <div className={menuPanelClass}>
      <div className={menuSectionLabelClass}>Create</div>
      <Link to="/quick-resume" className={menuLinkClass} onClick={closeMenus}>
        Quick Resume
      </Link>
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left`}
        onClick={handleCreateResumeClick}
      >
        Advanced Builder
      </button>
      <Link to="/ai-generator" className={menuLinkClass} onClick={closeMenus}>
        AI Generator
      </Link>

      <div className={menuSectionLabelClass}>Account</div>
      <Link to="/profile" className={menuLinkClass} onClick={closeMenus}>
        Account Settings
      </Link>
      <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
        ATS Guide
      </Link>
      <Link to="/pricing" className={menuLinkClass} onClick={closeMenus}>
        {isPremium ? 'Manage Subscription' : 'Upgrade Plan'}
      </Link>
      <button
        type="button"
        className={`${menuLinkClass} w-full text-left text-red-600 dark:text-red-400`}
        onClick={handleSignOut}
      >
        Sign Out
      </button>
    </div>
  );

  return (
    <header className="relative z-[110] border-b border-gray-200 bg-white/95 py-4 backdrop-blur-sm transition-colors duration-200 dark:border-slate-700 dark:bg-slate-800/95">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 lg:gap-8">
            <Link to="/" className="shrink-0 text-2xl font-bold text-blue-600 dark:text-blue-400">
              ResumeATS
            </Link>

            <nav className="hidden md:flex items-center gap-1 rounded-xl border border-gray-200/80 bg-slate-50/90 px-2 py-1 dark:border-slate-700 dark:bg-slate-900/40">
              {user ? (
                <>
                  <Link to="/dashboard" className={navLinkClass(isActive('/dashboard'))}>
                    Dashboard
                  </Link>
                  <Link to="/applications" className={navLinkClass(isActive('/applications'))}>
                    Applications
                  </Link>
                  <Link to="/auto-apply" className={navLinkClass(isActive('/auto-apply'))}>
                    Auto-Apply
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/" className={navLinkClass(isActive('/'))}>
                    Home
                  </Link>
                  <Link to="/learn" className={navLinkClass(isActive('/learn'))}>
                    ATS Guide
                  </Link>
                  <Link to="/pricing" className={navLinkClass(isActive('/pricing'))}>
                    Pricing
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div ref={menuAreaRef} className="flex items-center gap-2">
            {user ? (
              <>
                <div className="hidden md:flex lg:hidden relative">
                  <button
                    type="button"
                    className={menuButtonClass(openMenu === 'compact' || isCreateActive || isAccountActive)}
                    onClick={() => toggleMenu('compact')}
                    aria-expanded={openMenu === 'compact'}
                    aria-haspopup="true"
                  >
                    <span>Menu</span>
                    <svg
                      className={`h-4 w-4 transition-transform ${openMenu === 'compact' ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openMenu === 'compact' && renderCompactMenu()}
                </div>

                <div className="hidden lg:flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      className={`${menuButtonClass(openMenu === 'create' || isCreateActive)} border border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-800 dark:bg-blue-500/10 dark:text-blue-300`}
                      onClick={() => toggleMenu('create')}
                      aria-expanded={openMenu === 'create'}
                      aria-haspopup="true"
                    >
                      <span>Create</span>
                      <svg
                        className={`h-4 w-4 transition-transform ${openMenu === 'create' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openMenu === 'create' && renderCreateMenu()}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      className={menuButtonClass(openMenu === 'account' || isAccountActive)}
                      onClick={() => toggleMenu('account')}
                      aria-expanded={openMenu === 'account'}
                      aria-haspopup="true"
                    >
                      <span>Account</span>
                      <svg
                        className={`h-4 w-4 transition-transform ${openMenu === 'account' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openMenu === 'account' && renderAccountMenu()}
                  </div>
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/signin" onClick={closeMenus}>
                  <Button variant="outline" size="sm" className="min-h-10 min-w-0 px-4 py-2">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup" onClick={closeMenus}>
                  <Button size="sm" className="min-h-10 min-w-0 px-4 py-2">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-header-menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <div id="mobile-header-menu" className="md:hidden mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <nav className="flex flex-col gap-1">
              {user ? (
                <>
                  <Link to="/dashboard" className={menuLinkClass} onClick={closeMenus}>
                    Dashboard
                  </Link>
                  <Link to="/applications" className={menuLinkClass} onClick={closeMenus}>
                    Applications
                  </Link>
                  <Link to="/auto-apply" className={menuLinkClass} onClick={closeMenus}>
                    Auto-Apply
                  </Link>
                  <Link to="/quick-resume" className={menuLinkClass} onClick={closeMenus}>
                    Quick Resume
                  </Link>
                  <button
                    type="button"
                    className={`${menuLinkClass} w-full text-left`}
                    onClick={handleCreateResumeClick}
                  >
                    Advanced Builder
                  </button>
                  <Link to="/ai-generator" className={menuLinkClass} onClick={closeMenus}>
                    AI Generator
                  </Link>
                  <Link to="/profile" className={menuLinkClass} onClick={closeMenus}>
                    Account Settings
                  </Link>
                  <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
                    ATS Guide
                  </Link>
                  <Link to="/pricing" className={menuLinkClass} onClick={closeMenus}>
                    {isPremium ? 'Manage Subscription' : 'Upgrade Plan'}
                  </Link>
                  <button
                    type="button"
                    className={`${menuLinkClass} w-full text-left text-red-600 dark:text-red-400`}
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/" className={menuLinkClass} onClick={closeMenus}>
                    Home
                  </Link>
                  <Link to="/learn" className={menuLinkClass} onClick={closeMenus}>
                    ATS Guide
                  </Link>
                  <Link to="/pricing" className={menuLinkClass} onClick={closeMenus}>
                    Pricing
                  </Link>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Link to="/signin" onClick={closeMenus}>
                      <Button variant="outline" size="sm" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={closeMenus}>
                      <Button size="sm" className="w-full">
                        Sign Up
                      </Button>
                    </Link>
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
