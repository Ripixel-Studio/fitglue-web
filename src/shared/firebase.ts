import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getMessaging, isSupported as isMessagingSupported, Messaging } from 'firebase/messaging';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let messaging: Messaging | undefined;
let firestore: Firestore | undefined;

// Memoises an in-flight initialisation so concurrent callers share ONE init
// instead of each racing to call initializeApp().
//
// initFirebase() is async and `await`s the hosting config BETWEEN its
// "already initialised?" guard and the initializeApp() assignment below. Without
// this promise, two callers that arrive during that await (e.g. App.tsx's
// fire-and-forget setup(), useAuth, useShowcaseOwner, the native refreshAuth
// bridge — all of which can mount/run together on an /app load) both see the
// globals still undefined, both pass the guard, and both call initializeApp().
// The second call throws FirebaseError "app/duplicate-app". Because App.tsx's
// setup() is fire-and-forget, that rejection was unhandled and surfaced in Sentry
// as a generic "Error" with culprit "/app/" (WEB-APP-4). Sharing the promise
// makes initializeApp() run exactly once.
let initPromise: Promise<{ app: FirebaseApp; auth: Auth; firestore: Firestore } | null> | null = null;

async function getFirebaseConfig() {
  try {
    const response = await fetch('/__/firebase/init.json');
    if (response.ok) {
      const config = await response.json();
      // Check if config is valid (has appId)
      if (config.appId) return config;
    }
  } catch (e) {
    console.warn('Could not load Firebase config from hosting.', e);
  }

  return null;
}

export async function initFirebase(): Promise<{ app: FirebaseApp; auth: Auth; firestore: Firestore } | null> {
  if (app && auth && firestore) return { app, auth, firestore };
  // A concurrent caller is already initialising — await the same promise rather
  // than starting a second initializeApp() (see initPromise above).
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const config = await getFirebaseConfig();
    if (!config) return null;

    app = initializeApp(config);
    auth = getAuth(app);
    firestore = getFirestore(app);

    // Messaging only works in browsers with service-worker + push + IndexedDB
    // support. `getMessaging()` does NOT throw synchronously on an unsupported
    // browser — it kicks off an async support probe and rejects a floating promise,
    // which surfaces as an unhandled "messaging/unsupported-browser" FirebaseError
    // (WEB-APP-1, seen from the native app's Android WebView). Ask first.
    try {
      if (await isMessagingSupported()) {
        messaging = getMessaging(app);
      } else {
        console.warn('Messaging not supported in this environment');
      }
    } catch (e) {
      console.warn('Messaging not supported in this environment', e);
    }

    return { app, auth, firestore };
  })();

  try {
    return await initPromise;
  } finally {
    // Release the in-flight memo. On success the resolved globals make the guard
    // above the fast path; on a null config (or a thrown init) the next call retries.
    initPromise = null;
  }
}

export const getFirebaseApp = () => app;
export const getFirebaseAuth = () => auth;
export const getFirebaseMessaging = () => messaging;
export const getFirebaseFirestore = () => firestore;
