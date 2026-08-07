import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from '../../shared/firebase';
import { useAtomValue } from 'jotai';
import { userAtom } from '../state/authState';
import { InputsService } from '../services/InputsService';
import { logger } from '../../shared/logger';

const FIREBASE_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Whether the Notification API is available in this environment.
 *
 * `Notification` is a bare global, so referencing it directly on a platform that
 * does not provide it (iOS Safari < 16.4, and many native WebViews — including the
 * ReactNativeWebView shell this app is embedded in) throws
 * `ReferenceError: Notification is not defined` rather than returning undefined.
 * `getMessaging()` returning a Messaging instance does NOT guarantee the global
 * exists, so every use of `Notification` must be guarded by this check first.
 */
const isNotificationSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window;

/**
 * Custom hook that manages Firebase Cloud Messaging (FCM) for push notifications.
 * 
 * Handles:
 * - Service worker registration for background notifications
 * - Permission requests and FCM token management
 * - Foreground message display with rich notification options
 * - Navigation on notification click (via window.location, not React Router)
 * 
 * Note: This hook is called outside Router context in App.tsx, so we use
 * window.location for navigation instead of useNavigate.
 */
export function useFCM() {
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!user) return;

    // Register the service worker for push notifications
    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          console.log('[useFCM] Service worker registered:', registration.scope);
          return registration;
        } catch (error) {
          logger.error('[useFCM] Service worker registration failed:', error);
        }
      }
      return undefined;
    };

    const setupFCM = async () => {
      const messaging = getFirebaseMessaging();
      if (!messaging) {
        // App might not be initialized yet, or messaging not supported
        return;
      }

      // Some environments (older iOS Safari, native WebViews) can create a
      // Messaging instance yet still lack the Notification global. Bail out
      // before touching it to avoid a ReferenceError.
      if (!isNotificationSupported()) {
        console.warn('[useFCM] Notifications are not supported in this environment');
        return;
      }

      // Register service worker first
      const swRegistration = await registerServiceWorker();

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, {
            vapidKey: FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: swRegistration,
          });

          if (currentToken) {
            console.log('[useFCM] FCM Token obtained');
            await InputsService.setFCMToken(currentToken);
          } else {
            console.warn('[useFCM] No registration token available. Request permission to generate one.');
          }
        }
      } catch (err) {
        logger.error('[useFCM] An error occurred while retrieving token:', err);
      }
    };

    setupFCM();

    // Foreground message handler
    const messaging = getFirebaseMessaging();
    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('[useFCM] Foreground message received:', payload);

        if (payload.notification && isNotificationSupported()) {
          const notificationType = payload.data?.type;
          const activityId = payload.data?.activity_id;
          const sourceId = payload.data?.sourceId;

          // Create notification with enhanced options
          const notification = new Notification(payload.notification.title || 'FitGlue', {
            body: payload.notification.body,
            icon: '/app/icons/icon-192.png',
            badge: '/app/icons/badge-72.png',
            tag: notificationType || 'default',
            data: payload.data,
            requireInteraction: notificationType === 'PENDING_INPUT',
          });

          // Handle click to navigate to the relevant page
          notification.onclick = () => {
            notification.close();
            window.focus();

            if (notificationType) {
              const urlMap: Record<string, string> = {
                'PENDING_INPUT': activityId ? `/activities/${activityId}` : '/inputs',
                'PIPELINE_SUCCESS': `/activities/${activityId}`,
                'PIPELINE_FAILED': `/activities/${activityId}`,
                'CONNECTION_ACTION': `/connections/${sourceId}`,
                'CONNECTION_ACTION_FAILED': `/connections/${sourceId}`,
                'SHOWCASE_ROUNDUP': payload.data?.slug ? `/showcase/${payload.data.slug}` : '/',
                'PIPELINE_CANCELLED': '/activities',
              };
              const targetPath = urlMap[notificationType];
              if (targetPath) {
                // Use window.location for navigation since we're outside Router context
                window.location.href = `/app${targetPath}`;
              }
            }
          };
        }
      });

      return () => unsubscribe();
    }
  }, [user]);
}
