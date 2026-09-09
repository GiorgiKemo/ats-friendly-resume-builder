import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ADMIN_THEME_STORAGE_KEY = 'resumeats.admin.theme';
const ADMIN_THEME_VALUES = new Set(['light', 'dark', 'system']);

const AdminThemeContext = createContext(null);

const readStoredPreference = () => {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    return ADMIN_THEME_VALUES.has(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
};

const readSystemPreference = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
);

export function AdminThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPreference);
  const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(query.matches);

    if (query.addEventListener) {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, preference);
    } catch {
      // A blocked storage API should not prevent the admin surface from working.
    }
  }, [preference]);

  const value = useMemo(() => ({
    isDark,
    preference,
    setPreference: (nextPreference) => {
      if (ADMIN_THEME_VALUES.has(nextPreference)) setPreference(nextPreference);
    },
  }), [isDark, preference]);

  return (
    <AdminThemeContext.Provider value={value}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) throw new Error('useAdminTheme must be used within AdminThemeProvider');
  return context;
}
