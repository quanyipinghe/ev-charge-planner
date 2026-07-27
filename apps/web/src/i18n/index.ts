import type { Locale } from '@evcp/models';
import { useSettings } from '@/store/settings';
import type { Params } from './codes';
import { type Dict, zhCN } from './zh-CN';
import { en } from './en';
import { ja } from './ja';

export type { Dict };
export type { AdviceCode, Params, Template, WarningCode } from './codes';

const DICTIONARIES: Record<Locale, Dict> = { 'zh-CN': zhCN, en, ja };

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export function dictFor(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? zhCN;
}

/** The active dictionary. Accessed as `t.planner.title` — fully typed, no key strings. */
export function useT(): Dict {
  return dictFor(useSettings((state) => state.settings.locale));
}

/** Best-matching supported locale for the browser, defaulting to Simplified Chinese. */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('en')) return 'en';
  }
  return 'zh-CN';
}

/**
 * Renders an engine advisory. Unknown codes fall back to the raw code rather than
 * blanking out, so a newly added rule is still visible before it is translated.
 */
export function renderAdvisory(
  table: Record<string, (params: Params) => string>,
  code: string,
  params: Params | undefined,
): string {
  const template = table[code];
  return template ? template(params ?? {}) : code;
}
