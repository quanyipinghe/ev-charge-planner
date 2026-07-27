import type { Strategy } from '@evcp/models';

/** The subset of planner inputs worth putting in a URL. */
export interface SharedPlan {
  v?: string;
  soc?: number;
  target?: number;
  kw?: number;
  dc?: boolean;
  strategy?: Strategy;
  depart?: number;
  tariff?: string;
  temp?: number;
}

/**
 * Encodes a plan into query parameters.
 *
 * Plain query parameters rather than an opaque blob: a shared link stays readable and
 * hand-editable, and it keeps working if the encoding ever changes.
 */
export function encodeSharedPlan(plan: SharedPlan): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(plan)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return params.toString();
}

export function decodeSharedPlan(search: string): SharedPlan {
  const params = new URLSearchParams(search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const strategy = params.get('strategy');
  return {
    v: params.get('v') ?? undefined,
    soc: num('soc'),
    target: num('target'),
    kw: num('kw'),
    dc: params.get('dc') === '1',
    strategy:
      strategy && ['asap', 'latest', 'cheapest', 'balanced'].includes(strategy)
        ? (strategy as Strategy)
        : undefined,
    depart: num('depart'),
    tariff: params.get('tariff') ?? undefined,
    temp: num('temp'),
  };
}

export function shareUrl(plan: SharedPlan): string {
  const query = encodeSharedPlan(plan);
  return `${window.location.origin}${window.location.pathname}?${query}`;
}
