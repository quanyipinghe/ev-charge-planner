import type { ChargePlan, Locale } from '@evcp/models';
import type { NotificationMessage } from './types';

export interface PlanMessageContext {
  locale: Locale;
  timeZone: string;
  vehicleName: string;
  /** Link back to the planner, appended to the message when provided. */
  appUrl?: string;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Local `HH:mm`, rounded to the nearest minute so 07:54:55 reads as 07:55. */
export function formatClock(instant: number, timeZone: string): string {
  const key = timeZone;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(new Date(Math.round(instant / 60_000) * 60_000));
}

export function formatDuration(minutes: number, locale: Locale): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (locale === 'zh-CN') {
    return hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
  }
  if (locale === 'ja') {
    return hours > 0 ? `${hours}時間${mins}分` : `${mins}分`;
  }
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥' };

export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

interface Strings {
  startTitle: string;
  completeTitle: string;
  start: string;
  end: string;
  duration: string;
  soc: string;
  energy: string;
  cost: string;
  valleyShare: string;
  chargedTo: string;
}

const STRINGS: Record<Locale, Strings> = {
  'zh-CN': {
    startTitle: '🔋 该开始充电了',
    completeTitle: '✅ 充电完成',
    start: '开始',
    end: '预计结束',
    duration: '预计用时',
    soc: '电量',
    energy: '补电',
    cost: '预计费用',
    valleyShare: '谷电占比',
    chargedTo: '已充至',
  },
  en: {
    startTitle: '🔋 Time to start charging',
    completeTitle: '✅ Charging complete',
    start: 'Start',
    end: 'Expected finish',
    duration: 'Expected duration',
    soc: 'State of charge',
    energy: 'Energy added',
    cost: 'Estimated cost',
    valleyShare: 'Off-peak share',
    chargedTo: 'charged to',
  },
  ja: {
    startTitle: '🔋 充電開始の時間です',
    completeTitle: '✅ 充電完了',
    start: '開始',
    end: '終了予定',
    duration: '所要時間',
    soc: '充電量',
    energy: '充電エネルギー',
    cost: '概算料金',
    valleyShare: '夜間電力の割合',
    chargedTo: 'まで充電',
  },
};

/**
 * Turns a plan into the two messages the reminder system sends.
 *
 * Templates live here rather than in the web app because the API needs them too —
 * a scheduled reminder fires long after the browser tab has been closed.
 */
export function renderPlanMessages(
  plan: ChargePlan,
  ctx: PlanMessageContext,
): { start: NotificationMessage; complete: NotificationMessage } {
  const t = STRINGS[ctx.locale];
  const start = formatClock(plan.startAt, ctx.timeZone);
  const end = formatClock(plan.endAt, ctx.timeZone);
  const duration = formatDuration(plan.chargingMinutes, ctx.locale);
  const cost = formatMoney(plan.cost.total, plan.cost.currency);
  const valleyPercent = Math.round(plan.levelShare.valley * 100);

  const startLines = [
    `**${ctx.vehicleName}**`,
    '',
    `${t.start}: ${start}`,
    `${t.end}: ${end}`,
    `${t.duration}: ${duration}`,
    `${t.soc}: ${plan.startSoc}% → ${plan.endSoc}%`,
    `${t.energy}: ${plan.batteryKwh.toFixed(1)} kWh`,
    `${t.cost}: ${cost}`,
  ];
  if (valleyPercent > 0) startLines.push(`${t.valleyShare}: ${valleyPercent}%`);

  const completeLines = [
    `**${ctx.vehicleName}** ${t.chargedTo} ${plan.endSoc}%`,
    '',
    `${t.energy}: ${plan.batteryKwh.toFixed(1)} kWh`,
    `${t.duration}: ${duration}`,
    `${t.cost}: ${cost}`,
  ];

  return {
    start: {
      title: t.startTitle,
      body: startLines.join('\n'),
      ...(ctx.appUrl ? { url: ctx.appUrl } : {}),
    },
    complete: {
      title: t.completeTitle,
      body: completeLines.join('\n'),
      ...(ctx.appUrl ? { url: ctx.appUrl } : {}),
    },
  };
}
