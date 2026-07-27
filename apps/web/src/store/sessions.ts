import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChargeSession } from '@evcp/models';
import { STORE_KEYS, persistStorage } from './persist';

interface SessionState {
  sessions: ChargeSession[];
  add: (session: ChargeSession) => void;
  remove: (id: string) => void;
  replaceAll: (sessions: ChargeSession[]) => void;
  clear: () => void;
}

export const useSessions = create<SessionState>()(
  persist(
    (set) => ({
      sessions: [],
      add: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions].sort((a, b) => b.startAt - a.startAt),
        })),
      remove: (id) => set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
      replaceAll: (sessions) =>
        set({ sessions: [...sessions].sort((a, b) => b.startAt - a.startAt) }),
      clear: () => set({ sessions: [] }),
    }),
    { name: STORE_KEYS.sessions, storage: persistStorage },
  ),
);
