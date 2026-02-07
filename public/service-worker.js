/**
 * Service Worker for Resume Generation
 *
 * This service worker helps with background processing, state persistence
 * during resume generation, and adds security headers to fetch responses.
 */

// Cache name for the app shell (Currently unused)
// const CACHE_NAME = 'resume-builder-cache-v1';

// Listen for install event
self.addEventListener('install', (_event) => { // event parameter was unused
  // Skip waiting to activate the new service worker immediately
  self.skipWaiting();

  console.log('Service Worker installed');
});

// Listen for activate event
self.addEventListener('activate', (event) => {
  // Claim clients to control all open tabs
  event.waitUntil(clients.claim());

  console.log('Service Worker activated');
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

// Listen for fetch events to add security headers
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle HTML requests to add security headers
  if (event.request.destination === 'document') {
    event.respondWith(
      // Fetch the app shell (/index.html) for SPA navigation.
      // The browser URL (event.request.url) should be preserved.
      fetch('/index.html')
        .then(appShellResponse => {
          if (!appShellResponse.ok) {
            console.error(`[SW] Failed to fetch /index.html, status: ${appShellResponse.status}. Original request: ${event.request.url}`);
            return new Response('Service worker failed to load app shell.', {
              status: 503, // Or appShellResponse.status
              statusText: 'Service Unavailable', // Or appShellResponse.statusText
              headers: { 'Content-Type': 'text/plain' }
            });
          }

          console.log(`[SW] Serving app shell (/index.html) for navigation to ${event.request.url}. Status for /index.html: ${appShellResponse.status}`);

          // Create a new response using the app shell's body and status,
          // then apply security headers.
          const newResponse = new Response(appShellResponse.body, {
            status: appShellResponse.status,
            statusText: appShellResponse.statusText,
            headers: new Headers(appShellResponse.headers) // Start with headers from /index.html response
          });

          // Ensure Content-Type is text/html for the app shell
          newResponse.headers.set('Content-Type', 'text/html');

          // Add security headers
          newResponse.headers.set('Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-eval' https://js.stripe.com https://generativelanguage.googleapis.com; connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.openai.com https://api.ipify.org https://generativelanguage.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-Nqnn8clbgv+5l0PgxcTOldg8mkMKrFn4TvPL+rYUUGg=' 'sha256-13vrThxdyT64GcXoTNGVoRRoL0a7EGBmOJ+lemEWyws=' 'sha256-QZ52fjvWgIOIOPr+gRIJZ7KjzNeTBm50Z+z9dH4N1/8=' 'sha256-yOU6eaJ75xfag0gVFUvld5ipLRGUy94G17B1uL683EU=' 'sha256-OpTmykz0m3o5HoX53cykwPhUeU4OECxHQlKXpB0QJPQ=' 'sha256-SSIM0kI/u45y4gqkri9aH+la6wn2R+xtcBj3Lzh7qQo=' 'sha256-ZH/+PJIjvP1BctwYxclIuiMu1wItb0aasjpXYXOmU0Y=' 'sha256-58jqDtherY9NOM+ziRgSqQY0078tAZ+qtTBjMgbM9po=' 'sha256-7Ri/I+PfhgtpcL7hT4A0VJKI6g3pK0ZvIN09RQV4ZhI=' 'sha256-D6zmPl9SPOA5yA8xbXKrLL0cVKn8FB4+jrOuJzlq4sI=' 'sha256-RMLuAlXIwRu2+YnnDVl5tzQPV2YlmPqSWSKEwJidCyc=' 'sha256-J0fb1cj+TvfbuwoWFcBRWXfZjjxyNBgv9RziegQUbxk=' 'sha256-+h218lrS+a9xO+7drwOfWjgpuVq/J66Fi1VVl/fnmSY=' 'sha256-iO7F2hy476ppWnd4pn3N47Ghu4N5JTJ6HwMLvn+hsuo=' 'sha256-S0YC/uXDAItX6fZw7W0jini2nSubFplw0SLxwxT5MIA=' 'sha256-zPGpewjcIvICZvc20/gzIzxzjxGh14DFhw4Sjpc/YI0=' 'sha256-UPf9P6UBqy4VzehzUvBqtM1y7TNEYtlok2L1ansrR2M=' 'sha256-XTyObgibb7bGqOF5oiFvpAKfVy5amQ0Q93zIx6/MtCk=' 'sha256-5vLND17KkR5h73s6GgqHErok0kDpG4KohGcxMEzTN1k=' 'sha256-TUiEkFBDhkSWQ4DHYll5yBWMScmQpD4/Ezeke1r6XwU=' 'sha256-vBxbnehTDgN6NkKbSYYkK0xnn1JTzXduOikbvd4Qdnc=' 'sha256-w3z/Zi/mZiPi7d/I9AeMPOE3yJjWiNR9flFCItMz5qw=' 'sha256-X8/U6XsU9vJCuDZiwtzZ2sHkib6u4qW5qCww2+65v4M=' 'sha256-S8WvDsuOheuw1pqhp6E2vrGq69NN3WOkq+WnT/Xdyy4=' 'sha256-+sRv+5ZP+JjjyOwy5QD3ySS+npOAVIsOLsfJV6wyaM0=' 'sha256-MDy3q0bbHcdgFz8YLT+Tok8rPWQY/tkM9/mkcbTwrG4=' 'sha256-KpKT4dJpyL2oGVGSRUH2NnVZYJOtNvkOKKJUxniUe5c=' 'sha256-gZ+YR3HDUvKxuDM7rIjZgCtfNlqIwwMcuf9sXMIuLzc=' 'sha256-xxDQXJByYLJNGk36xDRraofA4PbKABlSCCl3g1petmk=' 'sha256-XIqFfI4iOxUsKwDCJ86jviFyb+VIe2935gTD2lH6jC0='; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://via.placeholder.com; frame-src 'self' https://js.stripe.com; worker-src 'self' blob:; object-src 'none'; report-to csp-endpoint");
          newResponse.headers.set('Report-To',
            '{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"/api/csp-report"}],"include_subdomains":true}');
          newResponse.headers.set('X-Frame-Options', 'DENY');
          newResponse.headers.set('X-Content-Type-Options', 'nosniff');
          newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          newResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

          return newResponse;
        })
        .catch(error => {
          console.error(`[SW] Error in fetch handler for ${event.request.url}:`, error);
          return new Response('Service worker fetch failed.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
  }
});
