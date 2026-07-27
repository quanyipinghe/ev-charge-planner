import { useState } from 'react';
import type {
  AppSettings,
  ChargePlan,
  CurrentType,
  SegmentLevel,
  Tariff,
  Vehicle,
} from '@evcp/models';
import type { PriceBand, ScenarioResult } from '@evcp/calculator';
import { buildCalendar, renderPlanMessages } from '@evcp/notification';
import { Button, Card, Chip, Notice, Stat } from '@/components/ui';
import { SocChart } from '@/components/charts/SocChart';
import { ComparisonChart, LevelDonut } from '@/components/charts/MiniCharts';
import {
  downloadFile,
  formatClock,
  formatDuration,
  formatMoney,
  formatNumber,
  levelColorValue,
} from '@/lib/format';
import { isNextDay } from '@/lib/datetime';
import { api, buildTargets } from '@/lib/api';
import { shareUrl } from '@/lib/share';
import { useSessions } from '@/store/sessions';
import { newId } from '@/store/persist';
import { renderAdvisory, type Dict } from '@/i18n';

const LEVELS: SegmentLevel[] = ['valley', 'flat', 'peak', 'sharp'];
const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥' };

export function PlanResult({
  plan,
  bands,
  tariff,
  scenarios,
  vehicle,
  vehicleName,
  settings,
  t,
  isDark,
  currentType,
  chargerPowerKw,
}: {
  plan: ChargePlan;
  bands: readonly PriceBand[];
  tariff: Tariff | null;
  scenarios: readonly ScenarioResult[];
  vehicle: Vehicle;
  vehicleName: string;
  settings: AppSettings;
  t: Dict;
  isDark: boolean;
  currentType: CurrentType;
  chargerPowerKw: number;
}) {
  const addSession = useSessions((state) => state.add);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const symbol = CURRENCY_SYMBOLS[plan.cost.currency] ?? plan.cost.currency;
  const nothingToDo = plan.socCurve.length === 0;
  const peakScenario = scenarios.find((scenario) => scenario.key === 'peak');
  const saving = peakScenario?.available ? peakScenario.cost - plan.cost.total : 0;

  const notify = (text: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3000);
  };

  const messages = renderPlanMessages(plan, {
    locale: settings.locale,
    timeZone: settings.timeZone,
    vehicleName,
  });

  const downloadIcs = () => {
    const stamp = plan.startAt;
    const ics = buildCalendar(
      [
        {
          uid: `evcp-start-${stamp}@evchargeplanner`,
          start: plan.startAt,
          end: plan.endAt,
          summary: `${messages.start.title} · ${vehicleName}`,
          description: messages.start.body.replace(/\*\*/g, ''),
          alarmMinutesBefore: settings.notification.leadMinutes,
        },
        {
          uid: `evcp-done-${stamp}@evchargeplanner`,
          start: plan.endAt,
          end: plan.endAt + 60_000,
          summary: `${messages.complete.title} · ${vehicleName}`,
          description: messages.complete.body.replace(/\*\*/g, ''),
          alarmMinutesBefore: 0,
        },
      ],
      { calendarName: t.app.name },
    );
    downloadFile(`evcharge-${new Date(plan.startAt).toISOString().slice(0, 10)}.ics`, ics, 'text/calendar');
    notify(t.notify.calendarDownloaded);
  };

  const sendReminder = async () => {
    const { apiBaseUrl, leadMinutes } = settings.notification;
    const targets = buildTargets(settings.notification);
    if (!apiBaseUrl || targets.length === 0) {
      notify(t.notify.needsApi, 'error');
      return;
    }

    setBusy(true);
    try {
      await api.scheduleReminder(apiBaseUrl, {
        deviceId: settings.deviceId,
        kind: 'chargeStart',
        fireAt: plan.startAt - leadMinutes * 60_000,
        message: messages.start,
        targets,
        locale: settings.locale,
      });
      await api.scheduleReminder(apiBaseUrl, {
        deviceId: settings.deviceId,
        kind: 'chargeComplete',
        fireAt: plan.endAt,
        message: messages.complete,
        targets,
        locale: settings.locale,
      });
      notify(t.notify.reminderSet);
    } catch (error) {
      notify(`${t.notify.reminderFailed}: ${(error as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const logSession = () => {
    addSession({
      id: newId('session'),
      vehicleId: vehicle.id,
      startAt: plan.startAt,
      endAt: plan.endAt,
      startSoc: plan.startSoc,
      endSoc: plan.endSoc,
      batteryKwh: plan.batteryKwh,
      gridKwh: plan.gridKwh,
      cost: plan.cost.total,
      currency: plan.cost.currency,
      currentType,
      chargerPowerKw,
      tariffId: tariff?.id,
      fullCharge: plan.endSoc >= 99.5,
      createdAt: Date.now(),
    });
    notify(t.planner.sessionSaved);
  };

  const copyShareLink = async () => {
    const url = shareUrl({
      soc: plan.startSoc,
      target: plan.endSoc,
      kw: chargerPowerKw,
      dc: currentType === 'dc',
      strategy: plan.strategy,
      tariff: tariff?.id,
    });
    try {
      await navigator.clipboard.writeText(url);
      notify(t.common.copied);
    } catch {
      notify(url, 'error');
    }
  };

  if (nothingToDo) {
    return (
      <Card title={t.planner.result}>
        <div className="space-y-2">
          {plan.warnings.map((warning, index) => (
            <Notice key={`${warning.code}-${index}`} severity={warning.severity}>
              {renderAdvisory(t.warning, warning.code, warning.params)}
            </Notice>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title={t.planner.result}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="stat-label">{t.planner.startCharging}</div>
              <div className="tnum text-3xl font-semibold tracking-tight text-accent">
                {formatClock(plan.startAt, settings.timeZone)}
              </div>
            </div>
            <div aria-hidden="true" className="pb-2 text-2xl text-faint">
              →
            </div>
            <div>
              <div className="stat-label">{t.planner.finishCharging}</div>
              <div className="tnum text-3xl font-semibold tracking-tight">
                {formatClock(plan.endAt, settings.timeZone)}
                {isNextDay(plan.startAt, plan.endAt, settings.timeZone) && (
                  <span className="ml-1.5 align-middle text-xs font-medium text-faint">
                    {t.planner.nextDay}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="stat-label">{t.planner.duration}</div>
              <div className="tnum text-xl font-semibold">
                {formatDuration(plan.chargingMinutes, settings.locale)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
            <Stat
              label={t.planner.energyAdded}
              value={`${formatNumber(plan.batteryKwh, 1)} ${t.units.kwh}`}
              sub={`${plan.startSoc}% → ${plan.endSoc}%`}
            />
            <Stat
              label={t.planner.gridEnergy}
              value={`${formatNumber(plan.gridKwh, 1)} ${t.units.kwh}`}
              sub={`${t.planner.loss} ${formatNumber(plan.lossKwh, 1)} ${t.units.kwh}`}
            />
            <Stat
              label={t.planner.cost}
              value={formatMoney(plan.cost.total, plan.cost.currency)}
              sub={
                plan.cost.effectivePricePerKwh > 0
                  ? `${symbol}${plan.cost.effectivePricePerKwh.toFixed(3)}/${t.units.kwh}`
                  : undefined
              }
              accent="var(--accent)"
            />
            <Stat
              label={t.planner.highSocDwell}
              value={formatDuration(plan.highSocDwellMinutes, settings.locale)}
              sub={`> ${settings.highSocThreshold}%`}
            />
          </div>

          {tariff && (
            <div className="flex flex-wrap gap-2">
              {LEVELS.filter((level) => plan.levelShare[level] > 0.005).map((level) => (
                <Chip key={level} color={levelColorValue(level)}>
                  {t.level[level]} {(plan.levelShare[level] * 100).toFixed(0)}%
                </Chip>
              ))}
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="space-y-2">
              {plan.warnings.map((warning, index) => (
                <Notice key={`${warning.code}-${index}`} severity={warning.severity}>
                  {renderAdvisory(t.warning, warning.code, warning.params)}
                </Notice>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={downloadIcs}>
              {t.planner.addToCalendar}
            </Button>
            <Button onClick={sendReminder} disabled={busy}>
              {t.planner.sendNotification}
            </Button>
            <Button onClick={logSession}>{t.planner.saveSession}</Button>
            <Button variant="ghost" onClick={copyShareLink}>
              {t.planner.share}
            </Button>
          </div>

          {toast && (
            <Notice severity={toast.tone === 'ok' ? 'info' : 'warn'}>{toast.text}</Notice>
          )}
        </div>
      </Card>

      <Card title={t.planner.socCurve}>
        <SocChart
          plan={plan}
          bands={bands}
          timeZone={settings.timeZone}
          t={t}
          isDark={isDark}
        />
      </Card>

      {tariff && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title={t.planner.levelShare}>
            <LevelDonut share={plan.levelShare} t={t} isDark={isDark} />
          </Card>

          <Card title={t.planner.comparison}>
            <ComparisonChart
              bars={scenarios
                .filter((scenario) => scenario.available)
                .map((scenario) => ({
                  label: t.scenario[scenario.key],
                  cost: scenario.cost,
                  highlight: scenario.key === 'planned',
                }))}
              currencySymbol={symbol}
              label={t.planner.comparison}
              isDark={isDark}
            />
            <p className="mt-2 text-sm text-muted">
              {saving > 0.005
                ? t.scenario.savedVsPeak({ amount: formatMoney(saving, plan.cost.currency) })
                : t.scenario.noSaving}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
