import { useCallback, useEffect, useRef } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_INTERVAL_MS = 15 * 60_000;
const IDLE_CHECK_INTERVAL_MS = 60_000;
export const IDLE_BEFORE_RELOAD_MS = 5 * 60_000;

// Tablets stay open for weeks (kids mode, pinned app), so an OTA update downloaded at launch
// would never be applied. Fetch updates periodically and restart once nobody is using the screen.
export const useAutoAppUpdate = () => {
  const lastActivityAt = useRef(Date.now());

  useEffect(() => {
    if (Platform.OS === 'web' || !Updates.isEnabled || __DEV__) return;
    let active = true;
    let checking = false;
    let updateReady = false;

    const reloadIfIdle = () => {
      if (!active || !updateReady) return;
      if (AppState.currentState !== 'active' || Keyboard.isVisible()) return;
      if (Date.now() - lastActivityAt.current < IDLE_BEFORE_RELOAD_MS) return;
      void Updates.reloadAsync().catch((error) => console.warn('Failed to apply app update', error));
    };

    const checkForUpdate = async () => {
      if (checking || updateReady) return;
      checking = true;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) updateReady = (await Updates.fetchUpdateAsync()).isNew;
      } catch (error) {
        console.warn('Failed to check for app update', error);
      } finally {
        checking = false;
      }
      reloadIfIdle();
    };

    void checkForUpdate();
    const checkTimer = setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const idleTimer = setInterval(reloadIfIdle, IDLE_CHECK_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    return () => {
      active = false;
      clearInterval(checkTimer);
      clearInterval(idleTimer);
      appStateSubscription.remove();
    };
  }, []);

  return useCallback(() => {
    lastActivityAt.current = Date.now();
  }, []);
};
