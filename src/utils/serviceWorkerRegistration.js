/**
 * Service Worker Registration Utilities
 *
 * This file contains utilities for registering and communicating with a service worker
 * to help with background processing and state persistence during resume generation.
 * Modified to be bfcache-friendly by only activating when needed.
 */

// IndexedDB database name and store name
const DB_NAME = 'resumeGenerationState';
const STORE_NAME = 'state';
const DB_VERSION = 1;
let serviceWorkerRegistrationPromise = null;

// Generation progress can contain a job description. Scope every persisted
// record to the authenticated account so one tab cannot read, clear, or
// overwrite another account's in-progress work on the same browser profile.
const normalizeOwnerId = (ownerId) => typeof ownerId === 'string' && ownerId.trim()
  ? ownerId.trim()
  : '';
const scopedStorageKey = (baseKey, ownerId) => {
  const owner = normalizeOwnerId(ownerId);
  return owner ? `${baseKey}_${encodeURIComponent(owner)}` : null;
};
const scopedStateId = (ownerId) => {
  const owner = normalizeOwnerId(ownerId);
  return owner ? `current:${owner}` : null;
};
const browserLocalStorage = () => {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
};

/**
 * Register the service worker for resume generation, only when needed
 * @param {boolean} activateImmediately - Whether to activate the service worker immediately 
 * @returns {Promise<boolean>} - Whether registration was successful
 */
export const registerServiceWorker = async (activateImmediately = false) => {
  if (import.meta.env.DEV && typeof window !== 'undefined' && 'navigator' in window && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.scope.startsWith(window.location.origin))
          .map((registration) => registration.unregister())
      );
    } catch (error) {
      console.warn('Failed to clean up development service workers:', error);
    }

    return false;
  }

  // Only register when explicitly activated or when on resume generation page
  const shouldActivate = activateImmediately ||
    (typeof window !== 'undefined' && (
      window.location.pathname.includes('/ai-generator') ||
      window.location.hash.startsWith('#/ai-generator')
    ));

  // Check if we're in a browser environment and if service workers are supported
  if (shouldActivate && typeof window !== 'undefined' && 'navigator' in window && 'serviceWorker' in navigator) {
    try {
      if (!serviceWorkerRegistrationPromise) {
        serviceWorkerRegistrationPromise = (async () => {
          const existingRegistration = await navigator.serviceWorker.getRegistration('/');
          return existingRegistration || navigator.serviceWorker.register('/service-worker.js', {
            // Only update on page load, not during bfcache restoration
            updateViaCache: 'none',
            // Hash routes live under "/", so the worker needs root scope to control them.
            scope: '/'
          });
        })();
      }

      const registration = await serviceWorkerRegistrationPromise;

      if (import.meta.env.DEV) console.log('Service Worker registered with scope:', registration.scope);

      // Improve bfcache compatibility by handling unload
      if (!window.__resumeGenerationPagehideBound) {
        window.addEventListener('pagehide', () => {
          if (navigator.serviceWorker.controller) {
            // Send a message to the service worker to clean up
            navigator.serviceWorker.controller.postMessage({
              type: 'PREPARE_FOR_BFCACHE',
              payload: { timestamp: Date.now() }
            });
          }
        });
        window.__resumeGenerationPagehideBound = true;
      }

      return true;
    } catch (error) {
      serviceWorkerRegistrationPromise = null;
      console.error('Service Worker registration failed:', error);
      return false;
    }
  } else {
    if (import.meta.env.DEV) console.log('Service Worker activation skipped - not needed for current page');
    return false;
  }
};

/**
 * Send a message to the service worker
 * @param {Object} message - The message to send
 */
export const sendMessageToServiceWorker = (message) => {
  if (typeof window !== 'undefined' && 'navigator' in window &&
    'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  } else {
    if (import.meta.env.DEV) console.log('Service Worker messaging not available, using fallback implementation');
    // Implement fallback logic for when service worker is not available
    if (message.type === 'STORE_STATE') {
      const ownerId = message.payload?.userId || message.userId;
      const key = scopedStorageKey('resume_generation_fallback', ownerId);
      if (!key) return;
      const storage = browserLocalStorage();
      try {
        storage?.setItem(key, JSON.stringify({ data: message.payload, timestamp: Date.now() }));
      } catch (e) {
        console.error('Fallback storage failed:', e);
      }
    }
  }
};

/**
 * Listen for messages from the service worker
 * @param {Function} callback - The callback to call when a message is received
 * @returns {Function} - A cleanup function to remove the event listener
 */
export const listenForServiceWorkerMessages = (callback, ownerId) => {
  // Check if service worker is available
  if (typeof window !== 'undefined' && 'navigator' in window && 'serviceWorker' in navigator) {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const messageHandler = (event) => {
      if (normalizedOwnerId && event.data?.userId !== normalizedOwnerId) return;
      callback(event.data);
    };

    navigator.serviceWorker.addEventListener('message', messageHandler);

    // Return a cleanup function
    return () => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
    };
  } else {
    if (import.meta.env.DEV) console.log('Service Worker messaging not available, using fallback listener');

    // Implement a fallback check for account-scoped localStorage data.
    const checkLocalStorageFallback = () => {
      try {
        const key = scopedStorageKey('resume_generation_fallback', ownerId);
        const fallbackData = key ? browserLocalStorage()?.getItem(key) : null;
        if (fallbackData) {
          const parsedData = JSON.parse(fallbackData);
          callback({
            type: 'FALLBACK_DATA',
            payload: parsedData.data
          });
        }
      } catch (e) {
        console.error('Fallback check failed:', e);
      }
    };

    // Initial check
    checkLocalStorageFallback();

    // Return a no-op cleanup function
    return () => { };
  }
};

/**
 * Check if IndexedDB is available in the current environment
 * @returns {boolean} - Whether IndexedDB is available
 */
const isIndexedDBAvailable = () => {
  return typeof window !== 'undefined' && 'indexedDB' in window;
};

/**
 * Open the IndexedDB database
 * @returns {Promise<IDBDatabase>} - The database
 */
const openDatabase = () => {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (_event) => { // event was unused
      reject(new Error('Failed to open IndexedDB database'));
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Store the generation state in IndexedDB
 * @param {Object} state - The state to store
 * @returns {Promise<void>}
 */
export const storeGenerationState = async (state) => {
  const ownerId = state?.userId;
  const stateId = scopedStateId(ownerId);
  if (!stateId) return Promise.resolve();
  const storageKey = scopedStorageKey('resume_generation_state', ownerId);

  // If IndexedDB is not available, store in localStorage as fallback
  if (!isIndexedDBAvailable()) {
    try {
      const stateToStore = {
        ...state,
        id: stateId,
        timestamp: Date.now()
      };
      browserLocalStorage()?.setItem(storageKey, JSON.stringify(stateToStore));
      return Promise.resolve();
    } catch (error) {
      console.error('Error storing generation state in localStorage:', error);
      return Promise.resolve(); // Resolve anyway to prevent errors from propagating
    }
  }

  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Always use the same ID to overwrite the previous state
    const stateToStore = {
      ...state,
      id: stateId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(stateToStore);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (_event) => { // event was unused
        reject(new Error('Failed to store generation state'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error storing generation state:', error);
    // Try localStorage as fallback
    try {
      const stateToStore = {
        ...state,
        id: stateId,
        timestamp: Date.now()
      };
      browserLocalStorage()?.setItem(storageKey, JSON.stringify(stateToStore));
      return Promise.resolve();
    } catch (localStorageError) {
      console.error('Error storing generation state in localStorage fallback:', localStorageError);
    }
    return Promise.resolve(); // Resolve anyway to prevent errors from propagating
  }
};

/**
 * Get the generation state from IndexedDB
 * @returns {Promise<Object|null>} - The state or null if not found
 */
export const getGenerationState = async (ownerId) => {
  const stateId = scopedStateId(ownerId);
  if (!stateId) return null;
  const storageKey = scopedStorageKey('resume_generation_state', ownerId);

  // If IndexedDB is not available, try localStorage
  if (!isIndexedDBAvailable()) {
    try {
      const stateJson = browserLocalStorage()?.getItem(storageKey);
      if (stateJson) {
        return JSON.parse(stateJson);
      }
      return null;
    } catch (error) {
      console.error('Error getting generation state from localStorage:', error);
      return null;
    }
  }

  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(stateId);

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      request.onerror = (_event) => { // event was unused
        reject(new Error('Failed to get generation state'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error getting generation state from IndexedDB:', error);

    // Try localStorage as fallback
    try {
      const stateJson = browserLocalStorage()?.getItem(storageKey);
      if (stateJson) {
        return JSON.parse(stateJson);
      }
    } catch (localStorageError) {
      console.error('Error getting generation state from localStorage fallback:', localStorageError);
    }

    return null;
  }
};

/**
 * Clear the generation state from IndexedDB
 * @returns {Promise<void>}
 */
export const clearGenerationState = async (ownerId) => {
  const stateId = scopedStateId(ownerId);
  if (!stateId) return Promise.resolve();
  const storageKey = scopedStorageKey('resume_generation_state', ownerId);
  const progressKey = scopedStorageKey('resume_generation_progress', ownerId);
  const stepKey = scopedStorageKey('resume_generation_step', ownerId);

  // Always try to clear this account's localStorage state regardless of
  // IndexedDB availability. Never remove another account's progress keys.
  try {
    const storage = browserLocalStorage();
    storage?.removeItem(storageKey);
    storage?.removeItem(progressKey);
    storage?.removeItem(stepKey);
  } catch (localStorageError) {
    console.error('Error clearing generation state from localStorage:', localStorageError);
  }

  // If IndexedDB is not available, just return
  if (!isIndexedDBAvailable()) {
    return Promise.resolve();
  }

  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(stateId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (_event) => { // event was unused
        reject(new Error('Failed to clear generation state'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error clearing generation state from IndexedDB:', error);
    return Promise.resolve(); // Resolve anyway to prevent errors from propagating
  }
};
