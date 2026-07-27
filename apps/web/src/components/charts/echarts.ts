import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

// Only the pieces the app actually draws are registered, which keeps the ECharts
// chunk to a fraction of the full bundle.
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

export type { EChartsOption };

/**
 * Mounts an ECharts instance into a div and keeps it in sync with `option`.
 *
 * `themeKey` is part of the dependency list so a light/dark switch redraws with the
 * new palette — ECharts resolves colours at render time and cannot follow CSS vars.
 */
export function useEChart(
  option: EChartsOption,
  deps: readonly unknown[],
): React.RefObject<HTMLDivElement | null> {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!container.current) return;
    chart.current = echarts.init(container.current, undefined, { renderer: 'canvas' });

    const observer = new ResizeObserver(() => chart.current?.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
    // The option object is rebuilt on every render; the caller's deps decide when
    // that actually matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return container;
}
