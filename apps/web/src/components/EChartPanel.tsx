import type { ECharts, EChartsOption } from "echarts";
import { useEffect, useRef } from "react";

type Props = {
  title: string;
  description: string;
  option: EChartsOption;
  tableRows: Array<Record<string, unknown>>;
};

function displayValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "";
  return String(value);
}

export function EChartPanel({ title, description, option, tableRows }: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    let cancelled = false;
    let chart: ECharts | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function renderChart() {
      const echarts = await import("echarts");
      if (cancelled || !elementRef.current) return;
      chart = echarts.init(elementRef.current, undefined, { renderer: "canvas" });
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      chart.setOption({ ...option, animation: !reducedMotion }, true);
      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(elementRef.current);
    }

    void renderChart();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      chart?.dispose();
    };
  }, [option]);

  const columns = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];

  return (
    <section className="chart-card" data-chart-title={title}>
      <div className="chart-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div
        className="chart-surface"
        ref={elementRef}
        role="img"
        aria-label={`${title}. ${description}`}
      />
      <div className="sr-only">
        <table>
          <caption>{title} data</caption>
          <thead>
            <tr>
              {columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => <td key={column}>{displayValue(row[column])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
