import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Vehicle } from '@evcp/models';
import { STORE_KEYS, newId, persistStorage } from './persist';

export interface GarageVehicle {
  id: string;
  /** A full copy, so a catalogue update never silently changes a saved car. */
  vehicle: Vehicle;
  nickname?: string;
  custom: boolean;
  addedAt: number;
}

/** A user-entered vehicle: everything except the fields the store assigns itself. */
export type CustomVehicleSpec = Omit<Vehicle, 'id' | 'verified'>;

interface GarageState {
  vehicles: GarageVehicle[];
  addFromCatalog: (vehicle: Vehicle) => string;
  addCustom: (vehicle: CustomVehicleSpec, nickname?: string) => string;
  update: (id: string, patch: Partial<GarageVehicle>) => void;
  updateSpec: (id: string, patch: Partial<Vehicle>) => void;
  remove: (id: string) => void;
  replaceAll: (vehicles: GarageVehicle[]) => void;
}

export const useGarage = create<GarageState>()(
  persist(
    (set) => ({
      vehicles: [],

      addFromCatalog: (vehicle) => {
        const id = newId('veh');
        set((state) => ({
          vehicles: [...state.vehicles, { id, vehicle, custom: false, addedAt: Date.now() }],
        }));
        return id;
      },

      addCustom: (spec, nickname) => {
        const id = newId('veh');
        const vehicle: Vehicle = { ...spec, id, verified: false };
        set((state) => ({
          vehicles: [
            ...state.vehicles,
            { id, vehicle, nickname, custom: true, addedAt: Date.now() },
          ],
        }));
        return id;
      },

      update: (id, patch) =>
        set((state) => ({
          vehicles: state.vehicles.map((entry) =>
            entry.id === id ? { ...entry, ...patch } : entry,
          ),
        })),

      updateSpec: (id, patch) =>
        set((state) => ({
          vehicles: state.vehicles.map((entry) =>
            entry.id === id ? { ...entry, vehicle: { ...entry.vehicle, ...patch } } : entry,
          ),
        })),

      remove: (id) =>
        set((state) => ({ vehicles: state.vehicles.filter((entry) => entry.id !== id) })),

      replaceAll: (vehicles) => set({ vehicles }),
    }),
    { name: STORE_KEYS.garage, storage: persistStorage },
  ),
);

/** Name to show for a garage entry: the nickname if set, otherwise the model name. */
export function garageLabel(entry: GarageVehicle, locale: 'zh-CN' | 'en' | 'ja'): string {
  if (entry.nickname) return entry.nickname;
  const zh = locale === 'zh-CN';
  const brand = (zh && entry.vehicle.brandZh) || entry.vehicle.brand;
  const model = (zh && entry.vehicle.modelZh) || entry.vehicle.model;
  const variant = (zh && entry.vehicle.variantZh) || entry.vehicle.variant;
  return [brand, model, variant].filter(Boolean).join(' ');
}
