import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getMessaging, isSupported as isMessagingSupported, Messaging } from 'firebase/messaging';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let messaging: Messaging | undefined;
let firestore: Firestore | undefined;

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
}

export const getFirebaseApp = () => app;
export const getFirebaseAuth = () => auth;
export const getFirebaseMessaging = () => messaging;
export const getFirebaseFirestore = () => firestore;
