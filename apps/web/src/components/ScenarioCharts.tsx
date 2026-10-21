import { EChartPanel } from "./EChartPanel";
import type { CustomSeriesRenderItemAPI, EChartsOption } from "echarts";
import { useMemo } from "react";
import { makeColorScale, statusColors, strategyLineTypes, strategyPalette } from "../chartColors";
import { formatPValue, getModelLabel, resolveVizSeries, selectedModelId } from "../scenarioUtils";
import type { ControlState, ScenarioBundle } from "../types";

type Props = {
  scenario: ScenarioBundle;
  state: ControlState;
};

/** Rows are chart-ready objects; these keys carry the axis, not a series. */
const axisKeys = new Set(["position", "lambda", "label", "modelId", "kind", "metric"]);

/** Series keys present in the data, in stable order, excluding axis columns. */
function seriesKeys(rows: Array<Record<string, unknown>>): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((key) => !axisKeys.has(key));
}

/**
 * Bars on a logarithmic axis. ECharts anchors a bar at the value 1, so anything under an
 * hour, a dollar or a service unit hangs *downward* from the 1 gridline. Stacking each bar
 * on a transparent base equal to the axis floor draws it from the floor up to its value
 * (floor + (value - floor) = value, exactly). `floor` is one decade below the smallest value.
 */
function logFloor(values: number[]): number {
  const smallest = Math.min(...values.filter((value) => Number.isFinite(value) && value > 0));
  return Number.isFinite(smallest) ? 10 ** (Math.floor(Math.log10(smallest)) - 1) : 0.01;
}

function logBarSeries(
  stack: string,
  floor: number,
  data: Array<{ value: number | null; itemStyle?: Record<string, unknown> }>,
  options: Record<string, unknown> = {}
) {
  return [
    {
      type: "bar" as const,
      stack,
      silent: true,
      tooltip: { show: false },
      itemStyle: { color: "transparent", borderWidth: 0 },
      emphasis: { disabled: true },
      data: data.map((item) => (item.value === null ? null : floor))
    },
    {
      type: "bar" as const,
      stack,
      ...options,
      data: data.map((item) => (item.value === null ? null : { ...item, value: item.value - floor }))
    }
  ];
}

/** Opacity that marks the selected strategy; rows without a strategy are never dimmed. */
const dimmed = 0.35;

/**
 * `?compare` before the hash draws every strategy on the panels the model select otherwise
 * filters. Participants never see it: the select filters because dimming read as "nothing
 * changed". It exists for the slide export (apps/web/scripts/export-slides.mjs), where a
 * projected reveal has to show the comparison in one chart, with no select to move.
 */
function isCompareView(): boolean {
  return new URLSearchParams(globalThis.location?.search ?? "").has("compare");
}

export function ScenarioCharts({ scenario, state }: Props) {
  const modelId = selectedModelId(scenario, state);
  const modelLabel = getModelLabel(scenario, modelId);
  // Read per render: hash navigation never changes the query string, so it is stable.
  const compare = isCompareView();
  // Memoised so EChartPanel's effect does not dispose and re-initialise every chart on
  // unrelated re-renders, such as typing in the take-home note field.
  const panels = useMemo(
    () => buildChartPanels(scenario, state, modelId, modelLabel, compare),
    [scenario, state, modelId, modelLabel, compare]
  );

  return (
    <div className="chart-grid">
      {panels.map((panel) => (
        <EChartPanel
          key={panel.title}
          title={panel.title}
          description={panel.description}
          option={panel.option}
          tableRows={panel.tableRows}
        />
      ))}
      {/* Suppressed where a detection grid exists: `associationResults` is fixed at the
          module's starting parameters, so it would contradict the charts as soon as a
          participant moved a slider. */}
      {scenario.associationResults.length > 0 && !scenario.vizSummaries.detection && (
        <AssociationTable scenario={scenario} modelId={modelId} />
      )}
    </div>
  );
}

function buildChartPanels(
  scenario: ScenarioBundle,
  state: ControlState,
  modelId: string,
  modelLabel: string,
  compare = false
) {
  const emphasis = (rowModelId: string | undefined): number =>
    !compare && rowModelId && rowModelId !== modelId ? dimmed : 1;
  const panels: Array<{
    title: string;
    description: string;
    option: EChartsOption;
    tableRows: Array<Record<string, unknown>>;
  }> = [];
  // Panels are built in a fixed order that puts the ones the model select redraws next to
  // the controls (module 3's regional scan and forest were a screen below them).
  // One scale per module, seeded with the model labels so a strategy keeps its colour on
  // every panel of the module, whichever panel draws it first.
  const modelLabels = (scenario.controls.find((control) => control.id === "modelId")?.values ?? []).map(
    (option) => option.label
  );
  const scale = makeColorScale(scenario, modelLabels);
  const colorFor = scale.color;

  const effectComparisons = resolveVizSeries(scenario, "effectComparisons", state);
  if (effectComparisons.length > 0) {
    const rows = effectComparisons as Array<{
      label: string;
      groupId?: string;
      modelId: string;
      beta: number;
      lower: number;
      upper: number;
    }>;
    // The select draws the selected strategy's estimates and nothing else: a dimmed bar
    // reads as "nothing changed". The other strategy's estimates stay on the chart as
    // labelled reference lines, so the comparison the module is about is still on screen.
    const shown = compare ? rows : rows.filter((row) => row.modelId === modelId);
    const reference = compare ? [] : rows.filter((row) => row.modelId !== modelId);
    panels.push({
      title: "Effect estimates",
      description: compare
        ? "Every strategy's effect estimate and 95% interval, one bar each."
        : `${modelLabel}: effect estimate and 95% interval per bar. Dashed lines are the other strategy's estimates.`,
      // Carrying the strategy into the data table means a screen-reader user can tell
      // which strategy is drawn — otherwise the control has an effect that is literally
      // invisible to them.
      tableRows: rows.map((row) => ({ ...row, shown: row.modelId === modelId })),
      option: {
        tooltip: {
          trigger: "axis",
          formatter: (items: unknown) => {
            const item = Array.isArray(items) ? (items[0] as { dataIndex: number }) : undefined;
            const row = item ? shown[item.dataIndex] : undefined;
            return row ? `${row.label}<br/>beta ${row.beta}<br/>95% interval ${row.lower} to ${row.upper}` : "";
          }
        },
        grid: { left: 96, right: 120, top: 28, bottom: 52 },
        xAxis: { type: "category", data: shown.map((row) => row.label), axisLabel: { interval: 0, rotate: 24 } },
        yAxis: { type: "value", name: "Effect" },
        series: [
          {
            type: "bar",
            barMaxWidth: 56,
            data: shown.map((row) => ({
              value: row.beta,
              // Groups keep their colour; a pooled row is a strategy and takes ink, never a
              // group's blue.
              itemStyle: { color: colorFor(row.groupId ?? row.label) }
            })),
            markLine: {
              symbol: "none",
              silent: true,
              lineStyle: { type: "dashed" },
              label: { position: "end", formatter: "{b}", width: 110, overflow: "break" },
              data: reference.map((row) => ({
                yAxis: row.beta,
                name: row.label,
                lineStyle: { color: colorFor(row.groupId ?? row.label) }
              }))
            }
          },
          {
            // The 95% interval on each bar: a bar's height is the estimate, its precision is
            // the module's whole point and was never drawn.
            type: "custom",
            silent: true,
            renderItem: (_params: unknown, api: CustomSeriesRenderItemAPI) => {
              const index = api.value(0) as number;
              const lower = api.coord([index, api.value(1) as number]);
              const upper = api.coord([index, api.value(2) as number]);
              const cap = 8;
              const stroke = { stroke: strategyPalette[0], lineWidth: 1.5 };
              return {
                type: "group",
                children: [
                  { type: "line", shape: { x1: lower[0], y1: lower[1], x2: upper[0], y2: upper[1] }, style: stroke },
                  { type: "line", shape: { x1: lower[0] - cap, y1: lower[1], x2: lower[0] + cap, y2: lower[1] }, style: stroke },
                  { type: "line", shape: { x1: upper[0] - cap, y1: upper[1], x2: upper[0] + cap, y2: upper[1] }, style: stroke }
                ]
              };
            },
            encode: { x: 0, y: [1, 2] },
            data: shown.map((row, index) => [index, row.lower, row.upper])
          }
        ]
      }
    });
  }

  const detection = resolveVizSeries(scenario, "detection", state);
  if (detection.length > 0) {
    const rows = detection as Array<{
      label: string;
      modelId: string;
      p: number;
      minusLog10P: number;
      detected: boolean;
      best?: boolean;
      threshold: number;
    }>;
    const best = rows.find((row) => row.best);
    panels.push({
      title: "Does it detect the locus?",
      description: `-log10(p) per model against the significance line, for the current parameters.${best ? ` Best here: ${best.label}.` : ""} Highlighted: ${modelLabel}.`,
      // The p-value and the verdict belong in the table too: "detected" is the answer the
      // module's committed prediction is scored against, and a bar height is not a verdict.
      tableRows: rows.map((row) => ({
        Model: row.label,
        "p-value": formatPValue(row.p),
        Detected: row.detected,
        ...(best ? { Best: Boolean(row.best) } : {}),
        selected: row.modelId === modelId
      })),
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 64, right: 24, top: 28, bottom: 76 },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.label),
          axisLabel: { interval: 0, rotate: 20, width: 130, overflow: "break" }
        },
        yAxis: { type: "value", name: "-log10(p)" },
        series: [{
          type: "bar",
          label: { show: true, position: "top" },
          markLine: {
            symbol: "none",
            data: [{ yAxis: rows[0].threshold, name: "p = 0.05" }]
          },
          data: rows.map((row) => ({
            value: row.minusLog10P,
            itemStyle: {
              color: row.detected ? statusColors.pass : statusColors.fail,
              opacity: emphasis(row.modelId)
            }
          }))
        }]
      }
    });
  }

  const forest = resolveVizSeries(scenario, "forest", state);
  if (forest.length > 0) {
    const rows = forest as Array<{
      label: string;
      groupId?: string;
      modelId?: string;
      /** Drawn under every strategy: the group estimates a meta-analysis combines. */
      pinned?: boolean;
      /** Per-summary weight of a pinned group row, in percent, keyed by summary modelId. */
      weights?: Record<string, number>;
      beta: number;
      lower: number;
      upper: number;
      kind: string;
    }>;
    const hasStrategies = rows.some((row) => row.modelId);
    // The select draws what the selected strategy reports: its own rows, plus the group
    // rows a summary combines. Nothing is dimmed; what is not reported is not drawn.
    const shown = hasStrategies && !compare ? rows.filter((row) => row.modelId === modelId || row.pinned) : rows;
    const rowLabel = (row: (typeof rows)[number]) => {
      // A group's weight belongs to one summary; with every summary drawn it would be wrong for the rest.
      const weight = compare ? undefined : row.weights?.[modelId];
      return weight === undefined ? row.label : `${row.label} (${weight}% weight)`;
    };
    // Bottom-to-top, so the first row reads at the top of a reversed category axis.
    const plotted = shown.slice().reverse();
    const selectedSummary = shown.find((row) => row.kind === "summary" && row.modelId === modelId);
    const printsWeights = shown.some((row) => row.weights?.[modelId] !== undefined);
    const reported = !hasStrategies
      ? ""
      : selectedSummary
        ? ` ${modelLabel} reports ${selectedSummary.beta} (${selectedSummary.lower} to ${selectedSummary.upper}).${printsWeights ? " Each group row shows the weight it carries." : ""}`
        : ` ${modelLabel}: ${shown.length} estimate${shown.length === 1 ? "" : "s"}, nothing pooled.`;
    panels.push({
      title: "Forest plot",
      description:
        `Effect estimate and 95% interval per row, against the null line at zero. Summary estimates are diamonds.${reported}`,
      tableRows: hasStrategies
        ? rows.map((row) => ({
            ...row,
            weights: undefined,
            weight: row.weights?.[modelId],
            shown: row.modelId === modelId || Boolean(row.pinned)
          }))
        : rows,
      option: {
        tooltip: {
          trigger: "item",
          formatter: (item: unknown) => {
            const row = plotted[(item as { dataIndex: number }).dataIndex];
            return row ? `${row.label}<br/>effect ${row.beta}<br/>95% interval ${row.lower} to ${row.upper}` : "";
          }
        },
        grid: { left: 160, right: 32, top: 28, bottom: 40 },
        xAxis: { type: "value", name: "Effect" },
        yAxis: {
          type: "category",
          data: plotted.map(rowLabel),
          // Wrapped, not truncated: "Admixed American ancestry background" clipped to
          // "American ancestry background" is worse than two lines of text.
          axisLabel: { width: 150, overflow: "break" }
        },
        series: [{
          type: "custom",
          // A forest plot is an interval with a point estimate on it. Bars from zero read as
          // magnitudes off the axis origin and drop the precision entirely — which is the
          // one thing a forest plot exists to show.
          renderItem: (_params: unknown, api: CustomSeriesRenderItemAPI) => {
            const categoryIndex = api.value(0) as number;
            const lower = api.coord([api.value(1) as number, categoryIndex]);
            const upper = api.coord([api.value(2) as number, categoryIndex]);
            const point = api.coord([api.value(3) as number, categoryIndex]);
            const row = plotted[categoryIndex];
            // Summary rows are strategies and take ink or cyan; group rows keep their colour.
            const color = colorFor(row.groupId ?? row.label);
            const cap = 6;
            const size = row.kind === "summary" ? 7 : 5;
            const stroke = { stroke: color, lineWidth: 2 };
            return {
              type: "group",
              children: [
                { type: "line", shape: { x1: lower[0], y1: lower[1], x2: upper[0], y2: upper[1] }, style: stroke },
                { type: "line", shape: { x1: lower[0], y1: lower[1] - cap, x2: lower[0], y2: lower[1] + cap }, style: stroke },
                { type: "line", shape: { x1: upper[0], y1: upper[1] - cap, x2: upper[0], y2: upper[1] + cap }, style: stroke },
                row.kind === "summary"
                  ? {
                      type: "polygon",
                      shape: {
                        points: [
                          [point[0], point[1] - size],
                          [point[0] + size, point[1]],
                          [point[0], point[1] + size],
                          [point[0] - size, point[1]]
                        ]
                      },
                      style: { fill: color }
                    }
                  : { type: "circle", shape: { cx: point[0], cy: point[1], r: size }, style: { fill: color } }
              ]
            };
          },
          encode: { x: [1, 2, 3], y: 0 },
          data: plotted.map((row, index) => [index, row.lower, row.upper, row.beta]),
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { type: "dashed" },
            label: { formatter: "No effect" },
            data: [{ xAxis: 0 }]
          }
        }]
      }
    });
  }

  const regional = resolveVizSeries(scenario, "regional", state);
  const regionalPositions = resolveVizSeries(scenario, "regionalPositions", state);
  if (regional.length > 0 && regionalPositions.length > 0) {
    // Columnar: each cell is one row of equal-length series, and the positions and the
    // significance line are stored once for the whole grid rather than on every row.
    const columns = regional[0] as Record<string, number[]>;
    const positions = (regionalPositions[0] as { positions: number[] }).positions;
    const thresholdRow = resolveVizSeries(scenario, "regionalThreshold", state)[0] as
      | { value: number }
      | undefined;
    const threshold = thresholdRow?.value;
    // The selected model's scan only. The comparison across models lives on the detection
    // panel; here the select shows what a GWAS run under that model would actually plot.
    const available = Object.keys(columns).filter((key) => Array.isArray(columns[key]));
    const keys = available.includes(modelId) && !compare ? [modelId] : available;
    // The axis spans every model's scan at these parameters, not just the drawn one:
    // auto-scaling would stretch a flat global-PC scan into a peak and hide the point.
    const yMax = Math.ceil(Math.max(threshold ?? 0, ...available.flatMap((key) => columns[key])) * 1.1 * 10) / 10;
    // Rebuilt per position so the visually-hidden data table still reads as one row per
    // marker; a screen-reader user should not get three bare lists of numbers.
    const tableRows = positions.map((position, index) => ({
      position,
      ...Object.fromEntries(keys.map((key) => [key, columns[key][index]]))
    }));
    panels.push({
      title: "Regional signal",
      description: `-log10(p) across the locus under ${modelLabel}. Switch the model to see its scan.`,
      tableRows,
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 56, right: 24, top: 40, bottom: 48 },
        // A value axis defaults to including zero, which squeezes a 0.4 Mb window into the
        // right-hand edge of a 0-14 Mb axis. Fit the axis to the window instead.
        xAxis: { type: "value", name: "Position (Mb)", min: "dataMin", max: "dataMax", scale: true },
        yAxis: { type: "value", name: "-log10(p)", min: 0, max: yMax },
        series: keys.map((key) => {
          const label = getModelLabel(scenario, key);
          return {
            name: label,
            type: "line",
            smooth: true,
            symbolSize: 7,
            itemStyle: { color: colorFor(label) },
            lineStyle: { color: colorFor(label), type: scale.lineType(label), width: 2.5 },
            ...(threshold !== undefined && key === keys[0]
              ? { markLine: { symbol: "none", data: [{ yAxis: threshold, name: "Significance" }] } }
              : {}),
            data: positions.map((position, pointIndex) => [position, columns[key][pointIndex]])
          };
        })
      }
    });
  }

  const reported = resolveVizSeries(scenario, "reported", state);
  if (reported.length > 0) {
    const allRows = reported as Array<{
      label: string;
      modelId: string;
      groupId?: string;
      p: number;
      minusLog10P: number;
      detected: boolean;
      threshold: number;
    }>;
    // Only what the selected synthesis would put in a results table: four p-values under
    // within-ancestry testing, one under either meta-analysis.
    const rows = allRows.filter((row) => row.modelId === modelId);
    panels.push({
      title: "What this synthesis reports",
      description: `-log10(p) of each estimate ${modelLabel} reports, against the significance line. ${rows.length} estimate${rows.length === 1 ? "" : "s"}.`,
      tableRows: allRows.map((row) => ({
        Estimate: row.label,
        Synthesis: getModelLabel(scenario, row.modelId),
        "p-value": formatPValue(row.p),
        Significant: row.detected,
        shown: row.modelId === modelId
      })),
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 64, right: 24, top: 28, bottom: 76 },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.label),
          axisLabel: { interval: 0, rotate: 20, width: 130, overflow: "break" }
        },
        yAxis: { type: "value", name: "-log10(p)" },
        series: [{
          type: "bar",
          barMaxWidth: 64,
          label: { show: true, position: "top" },
          markLine: {
            symbol: "none",
            data: [{ yAxis: rows[0]?.threshold ?? 1.3, name: "p = 0.05" }]
          },
          data: rows.map((row) => ({
            value: row.minusLog10P,
            itemStyle: { color: row.detected ? statusColors.pass : statusColors.fail }
          }))
        }]
      }
    });
  }

  const powerCurve = resolveVizSeries(scenario, "powerCurve", state);
  if (powerCurve.length > 0) {
    const rows = powerCurve as Array<{
      label: string;
      groupId?: string;
      modelId?: string;
      n: number;
      power: number;
      selected?: boolean;
    }>;
    // Rows that name a strategy are drawn only for the selected one; rows without a
    // strategy (a single-model module) are always drawn.
    const shownRows = compare ? rows : rows.filter((row) => !row.modelId || row.modelId === modelId);
    const labels = [...new Set(shownRows.map((row) => row.label))];
    const identity = (label: string) => rows.find((row) => row.label === label)?.groupId ?? label;
    const strategyOf = (label: string) => rows.find((row) => row.label === label)?.modelId;
    panels.push({
      title: "Power curve",
      description: `Detection probability by sample size for ${modelLabel}. Switch the strategy to compare.`,
      tableRows: rows.map((row) => ({ ...row, shown: !row.modelId || row.modelId === modelId })),
      option: {
        tooltip: { trigger: "axis" },
        legend: { top: 0 },
        // Three or more legend entries wrap to a second row that sat on the axis title.
        grid: { left: 56, right: 24, top: labels.length > 2 ? 72 : 48, bottom: 48 },
        xAxis: { type: "value", name: "N" },
        yAxis: { type: "value", name: "Power", min: 0, max: 1 },
        series: labels.map((label) => ({
          name: label,
          type: "line",
          smooth: true,
          symbolSize: 9,
          itemStyle: { color: colorFor(identity(label)) },
          lineStyle: {
            color: colorFor(identity(label)),
            type: scale.lineType(identity(label)),
            width: strategyOf(label) === modelId ? 3 : 2
          },
          data: shownRows
            .filter((row) => row.label === label)
            .map((row) => ({ value: [row.n, row.power], symbolSize: row.selected ? 14 : 7 }))
        }))
      }
    });
  }

  const heterogeneity = resolveVizSeries(scenario, "heterogeneity", state);
  if (heterogeneity.length > 0) {
    const rows = heterogeneity as Array<{ metric: string; value: number }>;
    panels.push({
      title: "Heterogeneity statistics",
      description: "Displays I², Cochran Q, its p-value, and between-group tau² for the selected heterogeneity.",
      tableRows: rows,
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 64, right: 24, top: 32, bottom: 64 },
        xAxis: { type: "category", data: rows.map((row) => row.metric), axisLabel: { interval: 0, rotate: 18 } },
        yAxis: { type: "value", name: "Value", min: 0 },
        series: [{
          type: "bar",
          label: { show: true, position: "top" },
          // Four statistics, one identity: colouring each bar differently would claim a
          // distinction the data does not make.
          itemStyle: { color: strategyPalette[0] },
          data: rows.map((row) => row.value)
        }]
      }
    });
  }

  const composition = resolveVizSeries(scenario, "localAncestryComposition", state);
  if (composition.length > 0) {
    const rows = composition as Array<{ label: string; groupId: string; proportion: number }>;
    panels.push({
      title: "Local ancestry at this locus",
      // Deliberately not a track across position: admixture tracts from recent admixture
      // span megabases, so the composition is constant across a 400 kb window. Drawing it
      // as a line across the window implied variation that the model does not contain.
      description: "Ancestry composition of the sample at this locus, constant across the displayed window.",
      tableRows: rows,
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 64, right: 24, top: 28, bottom: 76 },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.label),
          axisLabel: { interval: 0, rotate: 20, width: 120, overflow: "break" }
        },
        yAxis: { type: "value", name: "Proportion", min: 0, max: 1 },
        series: [{
          type: "bar",
          label: { show: true, position: "top" },
          data: rows.map((row) => ({
            value: row.proportion,
            itemStyle: { color: colorFor(row.groupId) }
          }))
        }]
      }
    });
  }

  const performanceCards = resolveVizSeries(scenario, "performanceCards", state);
  if (performanceCards.length > 0) {
    const rows = performanceCards as Array<{ label: string; modelId?: string; value: number }>;
    // Headroom derived from the data instead of a hardcoded ceiling.
    const yMax = Math.ceil(Math.max(...rows.map((row) => row.value)) * 12.5) / 10;
    panels.push({
      title: "Score accuracy (global R²)",
      description: `Compares each score's global R² on the whole cohort, the headline metric. Highlighted: ${modelLabel}.`,
      tableRows: rows.map((row) => ({ ...row, selected: row.modelId ? row.modelId === modelId : true })),
      option: {
        tooltip: { trigger: "axis" },
        grid: { left: 56, right: 24, top: 28, bottom: 56 },
        xAxis: { type: "category", data: rows.map((row) => row.label), axisLabel: { interval: 0, rotate: 18 } },
        yAxis: { type: "value", name: "R2", min: 0, max: yMax },
        series: [
          {
            type: "bar",
            data: rows.map((row) => ({
              value: row.value,
              itemStyle: { opacity: emphasis(row.modelId), color: colorFor(row.label) }
            }))
          }
        ]
      }
    });
  }

  const calibration = resolveVizSeries(scenario, "calibration", state);
  if (calibration.length > 0) {
    const rows = calibration as Array<Record<string, string | number>>;
    const models = seriesKeys(rows);
    // The selected score's calibration per group, and nothing else: the accuracy panel is
    // the comparison across scores; this one is what the chosen score does to each group.
    const model = models.includes(modelId) ? modelId : models[0];
    const drawn = compare ? models : [model];
    panels.push({
      title: "Calibration by ancestry",
      description: compare
        ? "How well each score's predictions align within each ancestry group (1 is perfect)."
        : `How well ${modelLabel}'s predictions align within each ancestry group (1 is perfect). Switch the score to compare.`,
      tableRows: rows.flatMap((row) =>
        drawn.map((key) => ({ label: row.label, score: getModelLabel(scenario, key), calibration: row[key] }))
      ),
      option: {
        tooltip: { trigger: "axis" },
        ...(compare ? { legend: { top: 0 } } : {}),
        grid: { left: 56, right: 24, top: compare ? 48 : 36, bottom: 56 },
        xAxis: { type: "category", data: rows.map((row) => String(row.label)), axisLabel: { interval: 0, rotate: 18 } },
        yAxis: { type: "value", name: "Calibration", min: 0, max: 1 },
        series: drawn.map((key) => ({
          name: getModelLabel(scenario, key),
          type: "bar",
          barMaxWidth: 64,
          label: { show: true, position: "top" },
          itemStyle: { color: colorFor(getModelLabel(scenario, key)) },
          data: rows.map((row) => Number(row[key]))
        }))
      }
    });
  }

  const coefficientPath = resolveVizSeries(scenario, "coefficientPath", state);
  if (coefficientPath.length > 0) {
    const rows = coefficientPath as Array<Record<string, number>>;
    const features = seriesKeys(rows);
    // The path is flat across the slider by construction; marking the current penalty on it
    // is what lets the slider touch this panel at all.
    const penaltyControl = scenario.controls.find((control) => control.id === "lambda");
    const penalty = Number(state.lambda ?? penaltyControl?.default);
    panels.push({
      title: "Weight shrinkage",
      description: `How ${modelLabel}'s weights shrink as the penalty rises; the vertical line is the current penalty (${penalty}).`,
      tableRows: rows.map((row) => ({ ...row, current: row.lambda === penalty })),
      option: {
        tooltip: { trigger: "axis" },
        legend: { top: 0 },
        grid: { left: 56, right: 24, top: features.length > 2 ? 72 : 48, bottom: 48 },
        xAxis: { type: "value", name: "Shrinkage" },
        yAxis: { type: "value", name: "Weight" },
        series: features.map((feature, index) => ({
          name: feature,
          type: "line",
          smooth: true,
          itemStyle: { color: strategyPalette[index % strategyPalette.length] },
          lineStyle: { color: strategyPalette[index % strategyPalette.length], type: strategyLineTypes[index % strategyLineTypes.length] },
          ...(index === 0 && Number.isFinite(penalty)
            ? { markLine: { symbol: "none", lineStyle: { type: "solid" }, label: { formatter: "Current" }, data: [{ xAxis: penalty }] } }
            : {}),
          data: rows.map((row) => [row.lambda, row[feature]])
        }))
      }
    });
  }

  const runtimeCurve = resolveVizSeries(scenario, "runtimeCurve", state);
  if (runtimeCurve.length > 0) {
    const allRows = runtimeCurve as Array<{
      label: string;
      platformId: string;
      platform: string;
      hours: number;
    }>;
    const rows = allRows.filter((row) => row.platformId === modelId);
    const shownRows = rows.length > 0 ? rows : allRows;
    // Analyses take their colours from their own labels, not from the module-wide scale:
    // the platforms are the select, never a series, and must not shift the analyses' hues.
    const analysisColor = makeColorScale(scenario, allRows.map((row) => row.label)).color;
    // The platform the question was asked on stays on the chart as hollow reference bars
    // when another is selected, with the slowdown or speedup called out in words: a
    // laptop's bars are only meaningful next to the node the room just reasoned about.
    const referenceId = String(scenario.controls.find((control) => control.id === "modelId")?.default ?? "");
    const referenceRows = referenceId !== modelId ? allRows.filter((row) => row.platformId === referenceId) : [];
    const referenceLabel = getModelLabel(scenario, referenceId);
    const ratio = referenceRows.length > 0 && shownRows[0] && referenceRows[0]
      ? shownRows[0].hours / referenceRows[0].hours
      : undefined;
    const runtimeFloor = logFloor([...shownRows, ...referenceRows].map((row) => row.hours));
    const callout = ratio === undefined
      ? ""
      : ratio >= 1
        ? ` ${modelLabel} takes ${ratio.toFixed(1)}× as long as the ${referenceLabel} in the question (hollow bars).`
        : ` ${modelLabel} is ${(1 / ratio).toFixed(0)}× faster than the ${referenceLabel} in the question (hollow bars).`;
    panels.push({
      title: "Runtime by analysis",
      description: `Estimated elapsed time on ${modelLabel}; the y-axis is logarithmic.${callout}`,
      tableRows: [...shownRows, ...referenceRows],
      option: {
        tooltip: {
          trigger: "axis",
          formatter: (items: unknown) => {
            const first = Array.isArray(items) ? (items[0] as { dataIndex: number }) : undefined;
            if (!first) return "";
            const analysis = shownRows[first.dataIndex]?.label;
            const lines = [analysis];
            for (const row of [...shownRows, ...referenceRows].filter((candidate) => candidate.label === analysis)) {
              lines.push(`${row.platform}: ${row.hours.toLocaleString()} h`);
            }
            return lines.join("<br/>");
          }
        },
        ...(referenceRows.length > 0 ? { legend: { top: 0 } } : {}),
        grid: { left: 72, right: 24, top: referenceRows.length > 0 ? 44 : 32, bottom: 96 },
        xAxis: {
          type: "category",
          data: shownRows.map((row) => row.label),
          axisLabel: { interval: 0, rotate: 24 }
        },
        yAxis: { type: "log", name: "Hours", min: runtimeFloor },
        series: [
          ...logBarSeries(
            "selected",
            runtimeFloor,
            shownRows.map((row) => ({ value: row.hours, itemStyle: { color: analysisColor(row.label) } })),
            // Legend swatches: ink for the selected platform, grey for the hollow reference
            // bars; the bars themselves are coloured per analysis in the data items.
            { name: modelLabel, itemStyle: { color: strategyPalette[0] } }
          ),
          ...(referenceRows.length > 0
            ? logBarSeries(
                "reference",
                runtimeFloor,
                referenceRows.map((row) => ({
                  value: row.hours,
                  itemStyle: { color: "transparent", borderColor: analysisColor(row.label), borderWidth: 2 }
                })),
                { name: referenceLabel, itemStyle: { color: "#9ca3af" } }
              )
            : [])
        ]
      }
    });
  }

  const costCurve = resolveVizSeries(scenario, "costCurve", state);
  if (costCurve.length > 0) {
    const allRows = costCurve as Array<{
      label: string;
      platformId: string;
      platform: string;
      provider: string;
      providerLabel: string;
      instance: string;
      usd: number;
    }>;
    const rows = allRows.filter((row) => row.platformId === modelId);
    const shownRows = rows.length > 0 ? rows : allRows;
    const providers = [...new Map(shownRows.map((row) => [row.provider, row])).values()];
    const analyses = [...new Set(shownRows.map((row) => row.label))];
    const providerColor = makeColorScale(scenario, providers.map((row) => row.providerLabel)).color;
    const instances = providers.map((row) => `${row.providerLabel.split(" (")[0]}: ${row.instance}`).join("; ");
    const costFloor = logFloor(shownRows.map((row) => row.usd));
    panels.push({
      title: "Compute cost by analysis",
      description: `What the same runs cost on ${modelLabel}-class hardware at on-demand list prices (${instances}); the y-axis is logarithmic. Bridges-2 has no dollar price: see the allocation panel and the note below the charts.`,
      tableRows: shownRows,
      option: {
        tooltip: {
          trigger: "axis",
          formatter: (items: unknown) => {
            const first = Array.isArray(items) ? (items[0] as { dataIndex: number }) : undefined;
            if (!first) return "";
            const analysis = analyses[first.dataIndex];
            const lines = [analysis];
            for (const row of shownRows.filter((candidate) => candidate.label === analysis)) {
              lines.push(`${row.providerLabel.split(" (")[0]}: $${row.usd.toLocaleString()}`);
            }
            return lines.join("<br/>");
          }
        },
        legend: { top: 0 },
        grid: { left: 72, right: 24, top: 48, bottom: 96 },
        xAxis: {
          type: "category",
          data: analyses,
          axisLabel: { interval: 0, rotate: 24 }
        },
        yAxis: { type: "log", name: "USD", min: costFloor },
        series: providers.flatMap((provider) =>
          logBarSeries(
            provider.provider,
            costFloor,
            analyses.map((analysis) => ({
              value: shownRows.find((row) => row.provider === provider.provider && row.label === analysis)?.usd ?? null,
              itemStyle: { color: providerColor(provider.providerLabel) }
            })),
            // Series-level colour feeds the legend swatch; the per-bar colours above feed the bars.
            { name: provider.providerLabel.split(" (")[0], itemStyle: { color: providerColor(provider.providerLabel) } }
          )
        )
      }
    });
  }

  const allocationCurve = resolveVizSeries(scenario, "allocationCurve", state);
  if (allocationCurve.length > 0) {
    const allRows = allocationCurve as Array<{ label: string; platformId: string; platform: string; su: number }>;
    const rows = allRows.filter((row) => row.platformId === modelId);
    const reference = resolveVizSeries(scenario, "allocationReference", state)[0] as
      | { label: string; credits: number; note: string }
      | undefined;
    // A laptop is not an allocation: the panel is simply absent for it, and says why on the
    // Bridges-2 classes so the absence is not read as a missing chart.
    if (rows.length > 0) {
      const analysisColor = makeColorScale(scenario, rows.map((row) => row.label)).color;
      const over = reference ? rows.filter((row) => row.su > reference.credits).map((row) => row.label) : [];
      const allocationFloor = logFloor(rows.map((row) => row.su));
      panels.push({
        title: "Allocation cost on Bridges-2",
        description: `Service units each scan charges on ${modelLabel}; the y-axis is logarithmic.${
          reference
            ? ` The line is an ${reference.label} (${reference.note}).${
                over.length > 0 ? ` Over it here: ${over.join(", ")}.` : " Every scan fits inside it here."
              }`
            : ""
        } Not shown for the laptop, which is not an allocation.`,
        tableRows: rows,
        option: {
          tooltip: {
            trigger: "axis",
            formatter: (items: unknown) => {
              const first = Array.isArray(items) ? (items[0] as { dataIndex: number }) : undefined;
              const row = first ? rows[first.dataIndex] : undefined;
              return row ? `${row.label}<br/>${row.su.toLocaleString()} SU` : "";
            }
          },
          grid: { left: 80, right: 24, top: 32, bottom: 96 },
          xAxis: {
            type: "category",
            data: rows.map((row) => row.label),
            axisLabel: { interval: 0, rotate: 24 }
          },
          // The allocation line stays on the axis even when every scan is far below it:
          // "fits easily" is only legible against the line it fits under.
          yAxis: {
            type: "log",
            name: "SU",
            min: allocationFloor,
            ...(reference ? { max: Math.max(reference.credits * 2, ...rows.map((row) => row.su)) } : {})
          },
          series: logBarSeries(
            "allocation",
            allocationFloor,
            rows.map((row) => ({ value: row.su, itemStyle: { color: analysisColor(row.label) } })),
            reference
              ? {
                  markLine: {
                    symbol: "none",
                    silent: true,
                    lineStyle: { type: "dashed" },
                    label: { formatter: reference.label, position: "insideEndTop" },
                    data: [{ yAxis: reference.credits }]
                  }
                }
              : {}
          )
        }
      });
    }
  }

  const feasibility = resolveVizSeries(scenario, "feasibility", state);
  if (feasibility.length > 0) {
    const allRows = feasibility as Array<{
      platform: string;
      platformId: string;
      analysis: string;
      hours: number;
      feasible: boolean;
    }>;
    const rows = allRows.filter((row) => row.platformId === modelId);
    const shownRows = rows.length > 0 ? rows : allRows;
    const referenceId = String(scenario.controls.find((control) => control.id === "modelId")?.default ?? "");
    const referenceFeasible = allRows.filter((row) => row.platformId === referenceId && row.feasible).length;
    const feasibleHere = shownRows.filter((row) => row.feasible).length;
    const feasibilityFloor = logFloor(shownRows.map((row) => row.hours));
    const comparison = referenceId !== modelId
      ? ` ${feasibleHere} of ${shownRows.length} scans fit in a week here, against ${referenceFeasible} of ${shownRows.length} on the ${getModelLabel(scenario, referenceId)} in the question.`
      : "";
    panels.push({
      title: "One-week feasibility",
      description: `Green scans finish within 168 hours on ${modelLabel}; red scans exceed the workshop's iterative-work threshold.${comparison}`,
      tableRows: shownRows,
      option: {
        tooltip: {
          trigger: "axis",
          formatter: (items: unknown) => {
            const first = Array.isArray(items) ? (items[0] as { dataIndex: number }) : undefined;
            const row = first ? shownRows[first.dataIndex] : undefined;
            return row ? `${row.analysis}<br/>${row.hours.toLocaleString()} h, ${row.feasible ? "within" : "over"} a week` : "";
          }
        },
        grid: { left: 72, right: 24, top: 32, bottom: 96 },
        xAxis: {
          type: "category",
          data: shownRows.map((row) => row.analysis),
          axisLabel: { interval: 0, rotate: 24 }
        },
        // The axis always reaches past the one-week line: when every scan finishes in under
        // 100 hours (a GPU node), auto-scaling stopped at 100 and the line was not drawn.
        yAxis: {
          type: "log",
          name: "Hours",
          min: feasibilityFloor,
          max: 10 ** Math.ceil(Math.log10(Math.max(168, ...shownRows.map((row) => row.hours))))
        },
        series: logBarSeries(
          "feasibility",
          feasibilityFloor,
          shownRows.map((row) => ({
            value: row.hours,
            itemStyle: { color: row.feasible ? statusColors.pass : statusColors.fail }
          })),
          { markLine: { silent: true, data: [{ yAxis: 168, name: "One week" }] } }
        )
      }
    });
  }

  return panels;
}

function AssociationTable({ scenario, modelId }: { scenario: ScenarioBundle; modelId: string }) {
  const rows = scenario.associationResults.filter((result) => result.modelId === modelId);
  const shownRows = rows.length > 0 ? rows : scenario.associationResults.slice(0, 4);

  return (
    <section className="chart-card association-summary">
      <div className="chart-heading">
        <h2>Precomputed association summary</h2>
        <p>Aggregate synthetic result table for the selected analytic strategy.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Group</th>
              <th>Effect</th>
              <th>SE</th>
              <th>p-value</th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row, index) => (
              <tr key={`${row.modelId}-${row.groupId ?? "all"}-${index}`}>
                <td>{getModelLabel(scenario, row.modelId)}</td>
                <td>{row.groupId?.toUpperCase() ?? "All"}</td>
                <td>{row.beta.toFixed(2)}</td>
                <td>{row.se.toFixed(2)}</td>
                <td>{formatPValue(row.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
