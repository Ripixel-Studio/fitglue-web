import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';

// --- Configuration ---
// We fetch the configuration from the Firebase Hosting reserved URL.
// This allows the same build artifact to be deployed to different Firebase projects (dev/test/prod)
// without rebuilding, as the hosting server provides the correct config for its environment.

async function getFirebaseConfig() {
  try {
    const response = await fetch('/__/firebase/init.json');
    if (!response.ok) throw new Error('Failed to fetch firebase config');
    return await response.json();
  } catch (e) {
    // Fallback for local development without 'firebase serve'
    // In a strictly "real" app, we might bake these in via build vars for local dev,
    // but checking for the emulator/hosting environment is robust.
    console.error('Could not load Firebase config. Ensure you are running via "firebase serve" or "firebase emulators:start".');

    // Show a visible error to the user
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff4444;color:white;padding:1rem;text-align:center;z-index:9999;';
    errorDiv.innerText = 'System Error: Could not load application configuration.';
    document.body.appendChild(errorDiv);

    return null;
  }
}

async function init() {
  const config = await getFirebaseConfig();
  if (!config) return;

  const app = initializeApp(config);
  const auth = getAuth(app);

  // --- State Observer & Protection ---
  onAuthStateChanged(auth, (user: User | null) => {
    const path = window.location.pathname;
    const isAuthPage = path.includes('login') || path.includes('register');
    const isAppPage = path.includes('app') || path.includes('dashboard');

    // Define clean redirects
    const LOGIN_URL = '/auth/login';
    const APP_URL = '/app';

    if (user) {
      console.log('User is logged in:', user.uid);
      if (isAuthPage) {
        window.location.href = APP_URL;
      }

      // Update Homepage Nav
      const landingNav = document.getElementById('landing-nav');
      if (landingNav) {
        landingNav.innerHTML = `<a href="${APP_URL}" class="btn primary small">Dashboard</a>`;
      }
    } else {
      console.log('User is logged out');
      if (isAppPage) {
        window.location.href = LOGIN_URL;
      }

      // Update Homepage Nav (Restore)
      const landingNav = document.getElementById('landing-nav');
      if (landingNav) {
        landingNav.innerHTML = `
            <a href="/auth/login" class="nav-link">Login</a>
        `;
      }
    }
  });

  // --- UI bindings ---
  // We bind these to window so they can be called from HTML onclick if we want quick prototyping,
  // OR we attach listeners here. Attaching listeners is cleaner TS.

  // Generic Helper
  const bindClick = (id: string, handler: () => void) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  };

  // Google Login
  bindClick('btn-login-google', async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Redirect happens in onAuthStateChanged
    } catch (error) {
      console.error('Google Sign-in Error', error);
      alert('Login failed. See console.');
    }
  });

  // Email/Pass Login
  bindClick('btn-login-email', async () => {
    const emailEl = document.getElementById('email') as HTMLInputElement;
    const passEl = document.getElementById('password') as HTMLInputElement;
    if (!emailEl?.value || !passEl?.value) return alert('Fill in all fields');

    try {
      await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
    } catch (error: unknown) {
      console.error('Login Error', error);
      alert(error instanceof Error ? error.message : 'Login failed');
    }
  });

  // Logout
  bindClick('btn-logout', async () => {
    try {
      await signOut(auth);
      window.location.href = '/auth/login';
    } catch (error) {
      console.error('Logout Error', error);
    }
  });
}

// Start
init();
