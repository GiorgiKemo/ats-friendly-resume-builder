function isHomePage() {
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    return !window.location.hash || window.location.hash === '#/' || window.location.hash === '';
  }
  return false;
}

if (isHomePage()) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = '/resume-illustration-desktop.svg';
  link.as = 'image';
  link.type = 'image/svg+xml';
  link.fetchPriority = 'high';
  document.head.appendChild(link);
}
