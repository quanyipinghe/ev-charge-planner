import { useMemo } from 'react';
import type { LevelBreakdown, SegmentLevel } from '@evcp/models';
import type { PeriodStats } from '@evcp/calculator';
import { type EChartsOption, useEChart } from './echarts';
import { useChartPalette } from '@/lib/hooks';
import type { Dict } from '@/i18n';

const LEVELS: SegmentLevel[] = ['valley', 'flat', 'peak', 'sharp', 'unknown'];

/** Share of energy taken in each tariff band. */
export function LevelDonut({
  share,
  t,
  isDark,
}: {
  share: LevelBreakdown;
  t: Dict;
  isDark: boolean;
}) {
  const palette = useChartPalette(isDark);

  const option = useMemo<EChartsOption>(() => {
    const data = LEVELS.filter((level) => share[level] > 0.0005).map((level) => ({
      name: t.level[level],
      value: Number((share[level] * 100).toFixed(1)),
      itemStyle: { color: palette.level[level] },
    }));

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        textStyle: { color: palette.ink, fontSize: 12 },
        formatter: '{b}: {c}%',
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: palette.muted, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data,
          itemStyle: { borderWidth: 2, borderColor: palette.surface },
        },
      ],
    };
  }, [share, t, palette]);

  const ref = useEChart(option, [option]);
  return <div ref={ref} className="h-48 w-full" role="img" aria-label={t.planner.levelShare} />;
}

/** Monthly energy (bars) against monthly spend (line). */
export function MonthlyChart({
  periods,
  currencySymbol,
  t,
  isDark,
}: {
  periods: readonly PeriodStats[];
  currencySymbol: string;
  t: Dict;
  isDark: boolean;
}) {
  const palette = useChartPalette(isDark);

  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 44, right: 44, top: 24, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        textStyle: { color: palette.ink, fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: periods.map((period) => period.key),
        axisLine: { lineStyle: { color: palette.line } },
        axisLabel: { color: palette.muted, fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: palette.muted, fontSize: 11 },
          splitLine: { lineStyle: { color: palette.line, type: 'dashed' } },
        },
        {
          type: 'value',
          axisLabel: { color: palette.muted, fontSize: 11, formatter: `${currencySymbol}{value}` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t.history.energy,
          type: 'bar',
          data: periods.map((period) => period.stats.batteryKwh),
          itemStyle: { color: palette.accent, borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 28,
        },
        {
          name: t.history.cost,
          type: 'line',
          yAxisIndex: 1,
          data: periods.map((period) => period.stats.cost),
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 2, color: palette.peak },
          itemStyle: { color: palette.peak },
        },
      ],
      legend: {
        top: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: palette.muted, fontSize: 11 },
      },
    }),
    [periods, currencySymbol, t, palette],
  );

  const ref = useEChart(option, [option]);
  return <div ref={ref} className="h-64 w-full" role="img" aria-label={t.history.monthly} />;
}

export interface ComparisonBar {
  label: string;
  cost: number;
  highlight?: boolean;
}

/** What the same energy would have cost under other arrangements. */
export function ComparisonChart({
  bars,
  currencySymbol,
  label,
  isDark,
}: {
  bars: readonly ComparisonBar[];
  currencySymbol: string;
  label: string;
  isDark: boolean;
}) {
  const palette = useChartPalette(isDark);

  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 4, right: 56, top: 8, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category',
        data: bars.map((bar) => bar.label).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 12 },
      },
      series: [
        {
          type: 'bar',
          data: bars
            .map((bar) => ({
              value: bar.cost,
              itemStyle: {
                color: bar.highlight ? palette.accent : palette.neutral,
                borderRadius: [0, 6, 6, 0],
                opacity: bar.highlight ? 1 : 0.55,
              },
            }))
            .reverse(),
          barMaxWidth: 18,
          label: {
            show: true,
            position: 'right',
            color: palette.muted,
            fontSize: 11,
            formatter: (params: unknown) =>
              `${currencySymbol}${((params as { value: number }).value ?? 0).toFixed(2)}`,
          },
        },
      ],
    }),
    [bars, currencySymbol, palette],
  );

  const ref = useEChart(option, [option]);
  return <div ref={ref} style={{ height: bars.length * 44 + 16 }} role="img" aria-label={label} />;
}
