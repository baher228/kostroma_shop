import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { HomeFontSize } from '../components/home/theme';

type HomePreferences = { sectionOrder: string[]; fontSize: HomeFontSize };

const DEFAULT_PREFERENCES: HomePreferences = { sectionOrder: [], fontSize: 'normal' };

const storageKey = (userId: string) => `home-preferences:${userId}`;

export const useHomePreferences = (userId: string) => {
  const [preferences, setPreferences] = useState<HomePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<HomePreferences>;
        setPreferences({
          sectionOrder: Array.isArray(parsed.sectionOrder) ? parsed.sectionOrder.filter((key) => typeof key === 'string') : [],
          fontSize: parsed.fontSize === 'large' ? 'large' : 'normal',
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<HomePreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [userId],
  );

  return {
    sectionOrder: preferences.sectionOrder,
    fontSize: preferences.fontSize,
    setSectionOrder: (sectionOrder: string[]) => update({ sectionOrder }),
    setFontSize: (fontSize: HomeFontSize) => update({ fontSize }),
  };
};
