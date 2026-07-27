import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  type PlanInput,
  type Strategy,
  type UsageMode,
  BUILTIN_CHARGERS,
  planInputSchema,
  vehicleDisplayName,
} from '@evcp/models';
import {
  assessBattery,
  buildPriceTimeline,
  compareScenarios,
  daysSinceFullCharge,
  estimateRangeKm,
  planCharge,
  recommendedTargetSoc,
} from '@evcp/calculator';
import { useT } from '@/i18n';
import { CATALOG_VEHICLES } from '@/data/catalog';
import { useSettings, useSettingsValue } from '@/store/settings';
import { garageLabel, useGarage } from '@/store/garage';
import { findTariff, useAllTariffs } from '@/store/tariffs';
import { useSessions } from '@/store/sessions';
import { nextLocalTime, roundToMinute, toDateTimeInput, fromDateTimeInput } from '@/lib/datetime';
import { useNow } from '@/lib/hooks';
import { decodeSharedPlan } from '@/lib/share';
import { Button, Card, Field, NumberInput, Segmented, SocSlider, Select, Toggle } from '@/components/ui';
import { VehiclePicker } from '@/components/VehiclePicker';
import { PlanResult } from '@/components/planner/PlanResult';
import { BatteryCard } from '@/components/planner/BatteryCard';
import { TripCard } from '@/components/planner/TripCard';

const STRATEGIES: Strategy[] = ['balanced', 'latest', 'cheapest', 'asap'];
const USAGE_MODES: UsageMode[] = ['daily', 'longTrip', 'parking'];

export function PlannerPage({ isDark }: { isDark: boolean }) {
  const t = useT();
  const settings = useSettingsValue();
  const updateSettings = useSettings((state) => state.update);
  const garage = useGarage((state) => state.vehicles);
  const addFromCatalog = useGarage((state) => state.addFromCatalog);
  const tariffs = useAllTariffs();
  const sessions = useSessions((state) => state.sessions);
  const [searchParams] = useSearchParams();
  const shared = useMemo(() => decodeSharedPlan(searchParams.toString()), [searchParams]);

  const [vehicleId, setVehicleId] = useState<string | undefined>(
    () => shared.v ?? settings.defaultVehicleId ?? garage[0]?.id,
  );
  const [chargerId, setChargerId] = useState(settings.defaultChargerId);
  const [customPowerKw, setCustomPowerKw] = useState<number | null>(shared.kw ?? null);
  const [currentSoc, setCurrentSoc] = useState(shared.soc ?? 35);
  const [targetSoc, setTargetSoc] = useState(shared.target ?? settings.targetSoc);
  const [plugInAt, setPlugInAt] = useState(() =>
    nextLocalTime(Date.now(), settings.timeZone, 20, 0),
  );
  const [useDeparture, setUseDeparture] = useState(true);
  const [departAt, setDepartAt] = useState(
    () => shared.depart ?? nextLocalTime(Date.now(), settings.timeZone, 8, 0, 60 * 60_000),
  );
  const [strategy, setStrategy] = useState<Strategy>(shared.strategy ?? settings.defaultStrategy);
  const [allowSplit, setAllowSplit] = useState(false);
  const [usageMode, setUsageMode] = useState<UsageMode>('daily');
  const [idleDays, setIdleDays] = useState(7);
  const [temperatureC, setTemperatureC] = useState<number | null>(shared.temp ?? null);
  const [tariffId, setTariffId] = useState(
    shared.tariff ?? settings.defaultTariffId ?? 'cn-luoyang-residential',
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const defaultCatalogVehicle = CATALOG_VEHICLES.find(
    (item) => item.id === settings.defaultVehicleId,
  );

  useEffect(() => {
    if (shared.v || garage.length > 0 || !defaultCatalogVehicle) return;
    addFromCatalog(defaultCatalogVehicle);
  }, [addFromCatalog, defaultCatalogVehicle, garage.length, shared.v]);

  const now = useNow();

  // Derived rather than synced through an effect, so removing the selected car from
  // the garage falls back cleanly instead of rendering an empty frame first.
  const entry =
    garage.find((item) => item.id === vehicleId || item.vehicle.id === vehicleId) ?? garage[0];
  const vehicle = entry?.vehicle;

  // Choices are remembered as they are made rather than written back in an effect,
  // which would fire on every mount and churn the store for no reason.
  const selectVehicle = (id: string) => {
    setVehicleId(id);
    updateSettings({ defaultVehicleId: id });
  };
  const selectCharger = (id: string) => {
    setChargerId(id);
    setCustomPowerKw(null);
    updateSettings({ defaultChargerId: id });
  };
  const selectTariff = (id: string) => {
    setTariffId(id);
    updateSettings({ defaultTariffId: id });
  };
  const selectStrategy = (next: Strategy) => {
    setStrategy(next);
    updateSettings({ defaultStrategy: next });
  };
  const charger = BUILTIN_CHARGERS.find((item) => item.id === chargerId) ?? BUILTIN_CHARGERS[1]!;
  const chargerPowerKw = customPowerKw ?? charger.powerKw;
  const tariff = findTariff(tariffs, tariffId);

  const planInput = useMemo<PlanInput | null>(() => {
    if (!vehicle) return null;
    const parsed = planInputSchema.safeParse({
      vehicle,
      chargerPowerKw,
      currentType: charger.currentType,
      currentSoc,
      targetSoc,
      efficiency: settings.efficiency,
      tariff,
      strategy,
      plugInAt,
      departAt: useDeparture ? departAt : undefined,
      bufferMinutes: settings.bufferMinutes,
      allowSplit,
      timeZone: settings.timeZone,
      temperatureC: temperatureC ?? undefined,
      monthlyKwhSoFar: settings.monthlyKwhSoFar,
      highSocThreshold: settings.highSocThreshold,
    });
    return parsed.success ? parsed.data : null;
  }, [
    vehicle,
    chargerPowerKw,
    charger.currentType,
    currentSoc,
    targetSoc,
    settings,
    tariff,
    strategy,
    plugInAt,
    useDeparture,
    departAt,
    allowSplit,
    temperatureC,
  ]);

  const plan = useMemo(() => (planInput ? planCharge(planInput) : null), [planInput]);

  const bands = useMemo(() => {
    if (!plan || plan.socCurve.length === 0) return [];
    return buildPriceTimeline({ start: plan.startAt, end: plan.endAt }, tariff, settings.timeZone);
  }, [plan, tariff, settings.timeZone]);

  const assessment = useMemo(() => {
    if (!vehicle) return null;
    const vehicleSessions = sessions.filter((session) => session.vehicleId === vehicle.id);
    return assessBattery({
      vehicle,
      currentSoc,
      targetSoc,
      usageMode,
      idleDays: usageMode === 'parking' ? idleDays : undefined,
      daysSinceFullCharge: daysSinceFullCharge(vehicleSessions, now),
      highSocDwellMinutes: plan?.highSocDwellMinutes,
      temperatureC: temperatureC ?? undefined,
      recentSessions: vehicleSessions.slice(0, 20),
    });
  }, [vehicle, currentSoc, targetSoc, usageMode, idleDays, plan, temperatureC, sessions, now]);

  const rangeKm = useMemo(
    () =>
      vehicle
        ? estimateRangeKm({
            vehicle,
            soc: plan?.endSoc ?? currentSoc,
            temperatureC: temperatureC ?? undefined,
          })
        : 0,
    [vehicle, plan, currentSoc, temperatureC],
  );

  const scenarios = useMemo(
    () => (plan ? compareScenarios(plan, tariff) : []),
    [plan, tariff],
  );

  const suggestedTarget = vehicle
    ? recommendedTargetSoc(vehicle, usageMode, usageMode === 'parking' ? idleDays : undefined)
    : undefined;

  if (!entry || !vehicle) {
    return (
      <Card title={t.garage.addVehicle}>
        <p className="mb-4 text-sm text-muted">{t.garage.noVehicles}</p>
        <VehiclePicker
          locale={settings.locale}
          t={t}
          onPick={(picked) => selectVehicle(addFromCatalog(picked))}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title={t.planner.title}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.planner.vehicle} htmlFor="vehicle">
              <Select
                id="vehicle"
                value={entry.id}
                onChange={(event) => selectVehicle(event.target.value)}
              >
                {garage.map((item) => (
                  <option key={item.id} value={item.id}>
                    {garageLabel(item, settings.locale)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t.planner.charger}
              htmlFor="charger"
              hint={`${vehicleDisplayName(vehicle, settings.locale)} · AC ${vehicle.acMaxKw} kW${
                vehicle.dcMaxKw > 0 ? ` · DC ${vehicle.dcMaxKw} kW` : ''
              }`}
            >
              <Select
                id="charger"
                value={chargerId}
                onChange={(event) => selectCharger(event.target.value)}
              >
                {BUILTIN_CHARGERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {settings.locale === 'zh-CN' ? (item.nameZh ?? item.name) : item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SocSlider
              label={t.planner.currentSoc}
              value={currentSoc}
              onChange={(value) => {
                setCurrentSoc(value);
                if (value >= targetSoc) setTargetSoc(Math.min(100, value + 5));
              }}
            />
            <SocSlider
              label={t.planner.targetSoc}
              value={targetSoc}
              min={0}
              accent="var(--accent)"
              onChange={setTargetSoc}
            />
          </div>

          {suggestedTarget !== undefined && Math.abs(suggestedTarget - targetSoc) > 0.5 && (
            <button
              type="button"
              onClick={() => setTargetSoc(suggestedTarget)}
              className="text-xs font-medium text-accent underline underline-offset-4"
            >
              {t.planner.applyTarget}: {suggestedTarget}%
            </button>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.planner.plugInAt} htmlFor="plug-in">
              <div className="flex gap-2">
                <input
                  id="plug-in"
                  type="datetime-local"
                  className="input tnum"
                  value={toDateTimeInput(plugInAt, settings.timeZone)}
                  onChange={(event) =>
                    setPlugInAt(fromDateTimeInput(event.target.value, settings.timeZone))
                  }
                />
                <Button onClick={() => setPlugInAt(roundToMinute(Date.now()))}>
                  {t.planner.now}
                </Button>
              </div>
            </Field>

            <Field
              label={t.planner.departAt}
              htmlFor="depart"
              hint={
                useDeparture ? undefined : t.planner.noDeparture
              }
            >
              <div className="flex gap-2">
                <input
                  id="depart"
                  type="datetime-local"
                  className="input tnum"
                  disabled={!useDeparture}
                  value={toDateTimeInput(departAt, settings.timeZone)}
                  onChange={(event) =>
                    setDepartAt(fromDateTimeInput(event.target.value, settings.timeZone))
                  }
                />
                <Button
                  onClick={() => setUseDeparture(!useDeparture)}
                  aria-pressed={useDeparture}
                  variant={useDeparture ? 'primary' : 'secondary'}
                  title={t.planner.departAt}
                >
                  {useDeparture ? '✓' : '—'}
                </Button>
              </div>
            </Field>
          </div>

          <Field label={t.planner.strategy} hint={t.strategy[`${strategy}Hint`]}>
            <Segmented
              value={strategy}
              onChange={selectStrategy}
              columns={2}
              options={STRATEGIES.map((item) => ({
                value: item,
                label: t.strategy[item],
                hint: t.strategy[`${item}Hint`],
              }))}
            />
          </Field>

          <Field label={t.planner.usageMode}>
            <Segmented
              value={usageMode}
              onChange={setUsageMode}
              options={USAGE_MODES.map((item) => ({ value: item, label: t.usage[item] }))}
            />
          </Field>

          {usageMode === 'parking' && (
            <Field label={t.usage.idleDays} htmlFor="idle-days">
              <NumberInput
                id="idle-days"
                value={idleDays}
                min={1}
                max={365}
                onValueChange={setIdleDays}
                suffix={t.common.days}
              />
            </Field>
          )}

          <Field label={t.planner.tariff} htmlFor="tariff">
            <Select id="tariff" value={tariffId} onChange={(event) => selectTariff(event.target.value)}>
              <option value="">{t.common.none}</option>
              {tariffs.map((item) => (
                <option key={item.id} value={item.id}>
                  {settings.locale === 'zh-CN' ? item.name : (item.nameEn ?? item.name)}
                </option>
              ))}
            </Select>
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm font-medium text-muted underline underline-offset-4"
            aria-expanded={showAdvanced}
          >
            {t.planner.advanced}
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-xl border border-line bg-raised p-4">
              <Toggle
                checked={allowSplit}
                onChange={setAllowSplit}
                label={t.planner.allowSplit}
                hint={t.planner.allowSplitHint}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.planner.charger} htmlFor="custom-kw">
                  <NumberInput
                    id="custom-kw"
                    value={chargerPowerKw}
                    min={1}
                    max={600}
                    step={0.1}
                    onValueChange={setCustomPowerKw}
                    suffix={t.units.kw}
                  />
                </Field>

                <Field label={t.planner.efficiency} htmlFor="efficiency">
                  <NumberInput
                    id="efficiency"
                    value={Math.round(settings.efficiency * 100)}
                    min={50}
                    max={100}
                    onValueChange={(value) => updateSettings({ efficiency: value / 100 })}
                    suffix="%"
                  />
                </Field>

                <Field label={t.planner.temperature} htmlFor="temperature">
                  <NumberInput
                    id="temperature"
                    value={temperatureC ?? ''}
                    min={-50}
                    max={60}
                    placeholder="—"
                    onValueChange={setTemperatureC}
                    suffix="°C"
                  />
                </Field>

                <Field
                  label={t.planner.monthlyKwh}
                  htmlFor="monthly-kwh"
                  hint={t.planner.monthlyKwhHint}
                >
                  <NumberInput
                    id="monthly-kwh"
                    value={settings.monthlyKwhSoFar}
                    min={0}
                    onValueChange={(value) => updateSettings({ monthlyKwhSoFar: value })}
                    suffix={t.units.kwh}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Card>

      {plan && (
        <PlanResult
          plan={plan}
          bands={bands}
          tariff={tariff}
          scenarios={scenarios}
          vehicle={vehicle}
          vehicleName={garageLabel(entry, settings.locale)}
          settings={settings}
          t={t}
          isDark={isDark}
          currentType={charger.currentType}
          chargerPowerKw={chargerPowerKw}
        />
      )}

      {assessment && (
        <BatteryCard assessment={assessment} rangeKm={rangeKm} t={t} plan={plan} />
      )}

      <TripCard
        vehicle={vehicle}
        temperatureC={temperatureC ?? undefined}
        t={t}
        onApply={setTargetSoc}
      />
    </div>
  );
}
