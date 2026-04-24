import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();
const THEME_STORAGE_KEY = 'theme';
const THEME_COLOR_LIGHT = '#4F46E5';
const THEME_COLOR_DARK = '#050607';

const getStoredTheme = () => {
  if (typeof window === 'undefined') return null;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
  } catch {
    return null;
  }
};

const getSystemPrefersDark = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const applyTheme = (isDark) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
};

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState(() => getStoredTheme() ?? 'system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  const isDark = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    applyTheme(isDark);

    if (typeof window === 'undefined') return;

    try {
      if (themePreference === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
      }
    } catch {
      // Ignore storage failures and continue with in-memory theme state.
    }
  }, [isDark, themePreference]);

  const toggleTheme = useCallback(() => {
    setThemePreference((previousPreference) => {
      const currentlyDark = previousPreference === 'system'
        ? systemPrefersDark
        : previousPreference === 'dark';

      return currentlyDark ? 'light' : 'dark';
    });
  }, [systemPrefersDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, themePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
