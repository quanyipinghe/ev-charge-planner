import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tariff } from '@evcp/models';
import { STORE_KEYS, persistStorage } from './persist';
import { CATALOG_TARIFFS } from '@/data/catalog';

interface TariffState {
  /** User-created or user-edited tariffs. Presets stay in the read-only catalogue. */
  custom: Tariff[];
  upsert: (tariff: Tariff) => void;
  remove: (id: string) => void;
  replaceAll: (tariffs: Tariff[]) => void;
}

export const useTariffs = create<TariffState>()(
  persist(
    (set) => ({
      custom: [],
      upsert: (tariff) =>
        set((state) => {
          const index = state.custom.findIndex((t) => t.id === tariff.id);
          if (index === -1) return { custom: [...state.custom, tariff] };
          const next = [...state.custom];
          next[index] = tariff;
          return { custom: next };
        }),
      remove: (id) => set((state) => ({ custom: state.custom.filter((t) => t.id !== id) })),
      replaceAll: (tariffs) => set({ custom: tariffs }),
    }),
    { name: STORE_KEYS.tariffs, storage: persistStorage },
  ),
);

/** Presets plus the user's own, with a user tariff shadowing a preset of the same id. */
export function useAllTariffs(): Tariff[] {
  const custom = useTariffs((state) => state.custom);
  const overridden = new Set(custom.map((t) => t.id));
  return [...custom, ...CATALOG_TARIFFS.filter((t) => !overridden.has(t.id))];
}

export function findTariff(all: readonly Tariff[], id: string | undefined): Tariff | null {
  if (!id) return null;
  return all.find((tariff) => tariff.id === id) ?? null;
}
