import { useState } from 'react';
import type { Vehicle } from '@evcp/models';
import { requiredSocForTrip, tripNeedsStop } from '@evcp/calculator';
import { Button, Card, Field, NumberInput, Notice, Toggle } from '@/components/ui';
import type { Dict } from '@/i18n';

/**
 * Works the target SOC out from a journey instead of asking the user to guess it —
 * the temperature correction is what makes this worth doing in winter.
 */
export function TripCard({
  vehicle,
  temperatureC,
  t,
  onApply,
}: {
  vehicle: Vehicle;
  temperatureC?: number;
  t: Dict;
  onApply: (soc: number) => void;
}) {
  const [distanceKm, setDistanceKm] = useState(80);
  const [roundTrip, setRoundTrip] = useState(true);
  const [reserveSoc, setReserveSoc] = useState(15);

  const input = { vehicle, distanceKm, roundTrip, reserveSoc, temperatureC };
  const required = requiredSocForTrip(input);
  const needsStop = tripNeedsStop(input);

  return (
    <Card title={t.planner.trip}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.planner.tripDistance} htmlFor="trip-distance">
            <NumberInput
              id="trip-distance"
              value={distanceKm}
              min={1}
              max={2000}
              onValueChange={setDistanceKm}
              suffix={t.units.km}
            />
          </Field>
          <Field label={t.planner.reserve} htmlFor="trip-reserve">
            <NumberInput
              id="trip-reserve"
              value={reserveSoc}
              min={0}
              max={50}
              onValueChange={setReserveSoc}
              suffix="%"
            />
          </Field>
        </div>

        <Toggle checked={roundTrip} onChange={setRoundTrip} label={t.planner.roundTrip} />

        {needsStop ? (
          <Notice severity="warn">{t.planner.tripNeedsStop}</Notice>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">{t.planner.tripResult({ soc: required })}</span>
            <Button variant="primary" onClick={() => onApply(required)}>
              {t.planner.applyTarget}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
