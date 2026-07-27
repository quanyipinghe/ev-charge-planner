import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type AppSettings,
  type NotificationSettings,
  appSettingsSchema,
  defaultSettings,
} from '@evcp/models';
import { STORE_KEYS, newId, persistStorage } from './persist';

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  update: (patch: Partial<AppSettings>) => void;
  updateNotification: (patch: Partial<NotificationSettings>) => void;
  replace: (settings: AppSettings) => void;
  reset: () => void;
}

function withDefaults(settings: AppSettings): AppSettings {
  return {
    ...settings,
    deviceId: settings.deviceId || newId('device'),
    // The browser knows the user's zone better than any stored default.
    timeZone: settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: withDefaults(defaultSettings()),
      hydrated: false,
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      updateNotification: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notification: { ...state.settings.notification, ...patch },
          },
        })),
      replace: (settings) => set({ settings: withDefaults(settings) }),
      reset: () => set({ settings: withDefaults(defaultSettings()) }),
    }),
    {
      name: STORE_KEYS.settings,
      storage: persistStorage,
      partialize: (state) => ({ settings: state.settings }),
      // Settings from an older release are re-parsed so new fields get their defaults
      // instead of arriving as undefined.
      merge: (persisted, current) => {
        const stored = (persisted as { settings?: unknown } | undefined)?.settings;
        const parsed = appSettingsSchema.safeParse(stored);
        return {
          ...current,
          settings: withDefaults(parsed.success ? parsed.data : current.settings),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.update({});
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);

export const useSettingsValue = (): AppSettings => useSettings((state) => state.settings);
