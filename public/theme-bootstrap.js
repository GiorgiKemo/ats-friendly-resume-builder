(() => {
  const storageKey = 'theme';
  const darkColor = '#0f172a';
  const lightColor = '#4F46E5';

  try {
    const storedTheme = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (!storedTheme && prefersDark);
    const root = document.documentElement;

    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDark ? darkColor : lightColor);
    }
  } catch {
    // Ignore storage or media-query errors and keep the default light theme.
  }
})();
