import { del, get, set } from 'idb-keyval';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * IndexedDB-backed storage for the zustand `persist` middleware.
 *
 * Everything the app knows lives here and nowhere else — there are no accounts and
 * no server-side copy — so IndexedDB is used rather than localStorage for the room
 * and the resilience.
 */
const indexedDbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export const persistStorage = createJSONStorage(() => indexedDbStorage);

export const STORE_KEYS = {
  settings: 'evcp-settings',
  garage: 'evcp-garage',
  tariffs: 'evcp-tariffs',
  sessions: 'evcp-sessions',
} as const;

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}
