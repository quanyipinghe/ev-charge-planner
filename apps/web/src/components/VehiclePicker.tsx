import { useMemo, useState } from 'react';
import { type Locale, type Vehicle, vehicleDisplayName } from '@evcp/models';
import { searchVehicles } from '@/data/catalog';
import { Button, Chip, TextInput } from './ui';
import type { Dict } from '@/i18n';

/**
 * Searchable list of the community vehicle database.
 *
 * Unverified entries are labelled rather than hidden: incomplete coverage is more
 * useful than none, as long as the user knows which numbers to double-check.
 */
export function VehiclePicker({
  locale,
  t,
  onPick,
  onCancel,
}: {
  locale: Locale;
  t: Dict;
  onPick: (vehicle: Vehicle) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchVehicles(query).slice(0, 60), [query]);

  return (
    <div className="space-y-3">
      <TextInput
        type="search"
        value={query}
        placeholder={t.garage.search}
        aria-label={t.garage.search}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />

      <ul className="max-h-96 divide-line overflow-y-auto rounded-xl border border-line">
        {results.map((vehicle) => (
          <li key={vehicle.id}>
            <button
              type="button"
              onClick={() => onPick(vehicle)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-raised"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {vehicleDisplayName(vehicle, locale)}
                </span>
                <span className="tnum mt-0.5 block truncate text-xs text-faint">
                  {vehicle.batteryCapacityKwh} kWh · {vehicle.batteryType} · AC {vehicle.acMaxKw} kW
                  {vehicle.dcMaxKw > 0 && ` · DC ${vehicle.dcMaxKw} kW`}
                </span>
              </span>
              {!vehicle.verified && (
                <Chip className="shrink-0 text-[10px]">{t.common.unverified}</Chip>
              )}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-faint">{t.common.empty}</li>
        )}
      </ul>

      {onCancel && (
        <Button onClick={onCancel} block>
          {t.common.cancel}
        </Button>
      )}
    </div>
  );
}
