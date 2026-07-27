import { useMemo, useState } from 'react';
import type { ChargeSession } from '@evcp/models';
import { usableCapacityKwh } from '@evcp/models';
import { energyByCurrentType, groupSessionsByMonth, summarizeSessions } from '@evcp/calculator';
import { useT } from '@/i18n';
import { useSettingsValue } from '@/store/settings';
import { garageLabel, useGarage } from '@/store/garage';
import { useSessions } from '@/store/sessions';
import { newId } from '@/store/persist';
import { Button, Card, EmptyState, Field, NumberInput, Stat } from '@/components/ui';
import { MonthlyChart } from '@/components/charts/MiniCharts';
import { downloadFile, formatDateTime, formatDuration, formatMoney, formatNumber } from '@/lib/format';
import { fromDateTimeInput, toDateTimeInput } from '@/lib/datetime';
import { useNow } from '@/lib/hooks';

const CSV_HEADER =
  'id,vehicleId,startAt,endAt,startSoc,endSoc,batteryKwh,gridKwh,cost,currency,currentType,chargerPowerKw';

function toCsv(sessions: readonly ChargeSession[]): string {
  const rows = sessions.map((session) =>
    [
      session.id,
      session.vehicleId,
      new Date(session.startAt).toISOString(),
      new Date(session.endAt).toISOString(),
      session.startSoc,
      session.endSoc,
      session.batteryKwh,
      session.gridKwh,
      session.cost,
      session.currency,
      session.currentType,
      session.chargerPowerKw,
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\n');
}

export function HistoryPage({ isDark }: { isDark: boolean }) {
  const t = useT();
  const settings = useSettingsValue();
  const garage = useGarage((state) => state.vehicles);
  const sessions = useSessions((state) => state.sessions);
  const removeSession = useSessions((state) => state.remove);
  const addSession = useSessions((state) => state.add);
  const [showForm, setShowForm] = useState(false);
  const now = useNow();

  const capacityOf = useMemo(() => {
    const table = new Map(
      garage.map((entry) => [entry.vehicle.id, usableCapacityKwh(entry.vehicle)]),
    );
    return (vehicleId: string) => table.get(vehicleId);
  }, [garage]);

  const thisMonthKey = useMemo(
    () => toDateTimeInput(now, settings.timeZone).slice(0, 7),
    [now, settings.timeZone],
  );

  const periods = useMemo(
    () => groupSessionsByMonth(sessions, settings.timeZone, capacityOf),
    [sessions, settings.timeZone, capacityOf],
  );
  const thisMonth = periods.find((period) => period.key === thisMonthKey)?.stats;
  const allTime = useMemo(() => summarizeSessions(sessions, capacityOf), [sessions, capacityOf]);
  const split = useMemo(() => energyByCurrentType(sessions), [sessions]);

  const currency = sessions[0]?.currency ?? 'CNY';
  const symbol = currency === 'CNY' || currency === 'JPY' ? '¥' : currency === 'USD' ? '$' : '';

  const vehicleName = (vehicleId: string): string => {
    const entry = garage.find((item) => item.vehicle.id === vehicleId);
    return entry ? garageLabel(entry, settings.locale) : vehicleId;
  };

  return (
    <div className="space-y-4">
      <Card title={`${t.history.stats} · ${t.history.thisMonth}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t.history.count} value={thisMonth?.count ?? 0} />
          <Stat
            label={t.history.energy}
            value={`${formatNumber(thisMonth?.batteryKwh ?? 0, 1)} ${t.units.kwh}`}
          />
          <Stat
            label={t.history.cost}
            value={formatMoney(thisMonth?.cost ?? 0, currency)}
            accent="var(--accent)"
          />
          <Stat label={t.history.avgSoc} value={`${thisMonth?.averageEndSoc ?? 0}%`} />
        </div>
      </Card>

      <Card title={`${t.history.stats} · ${t.history.allTime}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t.history.count} value={allTime.count} />
          <Stat
            label={t.history.energy}
            value={`${formatNumber(allTime.batteryKwh, 1)} ${t.units.kwh}`}
            sub={`AC ${formatNumber(split.ac, 0)} / DC ${formatNumber(split.dc, 0)} ${t.units.kwh}`}
          />
          <Stat
            label={t.history.avgDuration}
            value={formatDuration(allTime.averageDurationMinutes, settings.locale)}
          />
          <Stat
            label={t.history.cycles}
            value={formatNumber(allTime.equivalentFullCycles, 2)}
            sub={`${t.history.avgSoc} ${allTime.averageEndSoc}%`}
          />
        </div>
      </Card>

      {periods.length > 0 && (
        <Card title={t.history.monthly}>
          <MonthlyChart periods={periods} currencySymbol={symbol} t={t} isDark={isDark} />
        </Card>
      )}

      <Card
        title={t.history.title}
        padded={false}
        action={
          <div className="flex gap-2">
            <Button onClick={() => setShowForm(!showForm)} aria-expanded={showForm}>
              {t.history.addManual}
            </Button>
            <Button
              disabled={sessions.length === 0}
              onClick={() =>
                downloadFile('evcharge-sessions.csv', toCsv(sessions), 'text/csv;charset=utf-8')
              }
            >
              {t.history.exportCsv}
            </Button>
          </div>
        }
      >
        {showForm && (
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <ManualSessionForm
              t={t}
              timeZone={settings.timeZone}
              vehicles={garage.map((entry) => ({
                id: entry.vehicle.id,
                label: garageLabel(entry, settings.locale),
              }))}
              onSubmit={(session) => {
                addSession(session);
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {sessions.length === 0 ? (
          <EmptyState>{t.history.noSessions}</EmptyState>
        ) : (
          <ul className="divide-line border-t border-line">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{vehicleName(session.vehicleId)}</div>
                  <div className="tnum mt-0.5 truncate text-xs text-faint">
                    {formatDateTime(session.startAt, settings.timeZone, settings.locale)} ·{' '}
                    {session.startSoc}% → {session.endSoc}% ·{' '}
                    {formatNumber(session.batteryKwh, 1)} {t.units.kwh} ·{' '}
                    {session.currentType.toUpperCase()}
                  </div>
                </div>
                <div className="tnum shrink-0 text-sm font-semibold">
                  {formatMoney(session.cost, session.currency)}
                </div>
                <button
                  type="button"
                  aria-label={t.common.delete}
                  className="shrink-0 rounded-lg px-2 py-1 text-muted transition-colors hover:text-danger"
                  onClick={() => {
                    if (window.confirm(t.history.deleteConfirm)) removeSession(session.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ManualSessionForm({
  t,
  timeZone,
  vehicles,
  onSubmit,
  onCancel,
}: {
  t: ReturnType<typeof useT>;
  timeZone: string;
  vehicles: { id: string; label: string }[];
  onSubmit: (session: ChargeSession) => void;
  onCancel: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [startAt, setStartAt] = useState(() => Date.now() - 3 * 3_600_000);
  const [endAt, setEndAt] = useState(() => Date.now());
  const [startSoc, setStartSoc] = useState(35);
  const [endSoc, setEndSoc] = useState(85);
  const [batteryKwh, setBatteryKwh] = useState(22.6);
  const [cost, setCost] = useState(7.4);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.planner.vehicle} htmlFor="manual-vehicle">
          <select
            id="manual-vehicle"
            className="input"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.planner.startCharging} htmlFor="manual-start">
          <input
            id="manual-start"
            type="datetime-local"
            className="input tnum"
            value={toDateTimeInput(startAt, timeZone)}
            onChange={(event) => setStartAt(fromDateTimeInput(event.target.value, timeZone))}
          />
        </Field>
        <Field label={t.planner.finishCharging} htmlFor="manual-end">
          <input
            id="manual-end"
            type="datetime-local"
            className="input tnum"
            value={toDateTimeInput(endAt, timeZone)}
            onChange={(event) => setEndAt(fromDateTimeInput(event.target.value, timeZone))}
          />
        </Field>
        <Field label={t.planner.currentSoc} htmlFor="manual-start-soc">
          <NumberInput id="manual-start-soc" value={startSoc} min={0} max={100} onValueChange={setStartSoc} suffix="%" />
        </Field>
        <Field label={t.planner.targetSoc} htmlFor="manual-end-soc">
          <NumberInput id="manual-end-soc" value={endSoc} min={0} max={100} onValueChange={setEndSoc} suffix="%" />
        </Field>
        <Field label={t.planner.energyAdded} htmlFor="manual-kwh">
          <NumberInput id="manual-kwh" value={batteryKwh} min={0} step={0.1} onValueChange={setBatteryKwh} suffix={t.units.kwh} />
        </Field>
        <Field label={t.planner.cost} htmlFor="manual-cost">
          <NumberInput id="manual-cost" value={cost} min={0} step={0.01} onValueChange={setCost} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!vehicleId || endAt <= startAt}
          onClick={() =>
            onSubmit({
              id: newId('session'),
              vehicleId,
              startAt,
              endAt,
              startSoc,
              endSoc,
              batteryKwh,
              // Assume a typical AC efficiency when the user only knows what went in.
              gridKwh: Number((batteryKwh / 0.92).toFixed(2)),
              cost,
              currency: 'CNY',
              currentType: 'ac',
              chargerPowerKw: 7,
              fullCharge: endSoc >= 99.5,
              createdAt: Date.now(),
            })
          }
        >
          {t.common.save}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
