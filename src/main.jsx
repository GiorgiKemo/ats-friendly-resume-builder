import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { setupCSPReporting } from './utils/security'

// Setup CSP violation reporting
// setupCSPReporting(); // Temporarily disabled

// Register service worker
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/service-worker.js')
//       .then(registration => {
//         console.log('Service Worker registered with scope:', registration.scope);
//       })
//       .catch(error => {
//         console.error('Service Worker registration failed:', error);
//       });
//   });
// }

// The setTimeout/setInterval polyfills that used `new Function()` have been removed
// as they posed a security risk and were contrary to strict CSP practices.
// Any usage of setTimeout/setInterval with string arguments should be refactored
// in the codebase to use function references directly.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
