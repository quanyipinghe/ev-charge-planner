import { useMemo } from 'react';
import type { ChargePlan } from '@evcp/models';
import type { PriceBand } from '@evcp/calculator';
import { type EChartsOption, useEChart } from './echarts';
import { formatClock } from '@/lib/format';
import { useChartPalette } from '@/lib/hooks';
import type { Dict } from '@/i18n';

/**
 * SOC and power against wall-clock time, with the tariff bands shaded behind.
 *
 * Overlaying the price bands is the point of this chart: it makes "why does the plan
 * start at 03:17" answerable at a glance, and shows the taper as a visible bend.
 */
export function SocChart({
  plan,
  bands,
  timeZone,
  t,
  isDark,
}: {
  plan: ChargePlan;
  bands: readonly PriceBand[];
  timeZone: string;
  t: Dict;
  isDark: boolean;
}) {
  const palette = useChartPalette(isDark);

  const option = useMemo<EChartsOption>(() => {
    const socData = plan.socCurve.map((point) => [point.t, point.soc] as [number, number]);
    const powerData = plan.socCurve.map((point) => [point.t, point.powerKw] as [number, number]);

    // ECharts wants each shaded region as a two-element tuple, so the annotation is
    // what makes the array literals infer as tuples rather than plain arrays.
    type MarkAreaPair = [
      { xAxis: number; itemStyle: { color: string; opacity: number } },
      { xAxis: number },
    ];
    const markAreas: MarkAreaPair[] = bands.map((band) => [
      {
        xAxis: band.start,
        itemStyle: { color: palette.level[band.level], opacity: isDark ? 0.14 : 0.1 },
      },
      { xAxis: band.end },
    ]);

    return {
      animationDuration: 400,
      grid: { left: 40, right: 44, top: 24, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        textStyle: { color: palette.ink, fontSize: 12 },
        formatter: (params: unknown) => {
          const points = params as { value: [number, number]; seriesName: string }[];
          if (!points?.length) return '';
          const time = formatClock(points[0]!.value[0], timeZone);
          const rows = points
            .map((point) => {
              const unit = point.seriesName === t.planner.socCurve ? '%' : ' kW';
              return `${point.seriesName}: ${point.value[1].toFixed(1)}${unit}`;
            })
            .join('<br/>');
          return `${time}<br/>${rows}`;
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: palette.line } },
        axisLabel: {
          color: palette.muted,
          fontSize: 11,
          formatter: (value: number) => formatClock(value, timeZone),
        },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { color: palette.muted, fontSize: 11, formatter: '{value}%' },
          splitLine: { lineStyle: { color: palette.line, type: 'dashed' } },
        },
        {
          type: 'value',
          min: 0,
          axisLabel: { color: palette.muted, fontSize: 11, formatter: '{value}' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t.planner.socCurve,
          type: 'line',
          data: socData,
          smooth: 0.1,
          showSymbol: false,
          lineStyle: { width: 2.5, color: palette.accent },
          areaStyle: { color: palette.accent, opacity: isDark ? 0.14 : 0.1 },
          markArea: { silent: true, data: markAreas },
          z: 3,
        },
        {
          name: t.units.kw,
          type: 'line',
          yAxisIndex: 1,
          data: powerData,
          step: 'end',
          showSymbol: false,
          lineStyle: { width: 1.5, color: palette.muted, type: 'dashed' },
          z: 2,
        },
      ],
      textStyle: { fontFamily: 'inherit' },
    };
  }, [plan, bands, timeZone, t, palette, isDark]);

  const ref = useEChart(option, [option]);
  return <div ref={ref} className="h-64 w-full" role="img" aria-label={t.planner.socCurve} />;
}
