/**
 * Service Worker for Resume Generation
 *
 * This service worker helps with background processing, state persistence
 * during resume generation.
 */

// Cache name for the app shell (Currently unused)
// const CACHE_NAME = 'resume-builder-cache-v1';

// Listen for install event
self.addEventListener('install', (_event) => { // event parameter was unused
  // Skip waiting to activate the new service worker immediately
  self.skipWaiting();

  if (self.location.hostname === 'localhost') {
    console.log('Service Worker installed');
  }
});
// Listen for activate event
self.addEventListener('activate', (event) => {
  // Claim clients to control all open tabs
  event.waitUntil(clients.claim());

  if (self.location.hostname === 'localhost') {
    console.log('Service Worker activated');
  }
});
// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  // Handle progress updates
  if (event.data && event.data.type === 'GENERATION_PROGRESS') {
    // Store the progress in the service worker
    const progress = event.data.progress;

    // Broadcast the progress to all clients
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'GENERATION_PROGRESS_UPDATE',
          progress
        });
      });
    });
  }
});
