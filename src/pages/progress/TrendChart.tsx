// One smooth area chart for a lift over time: 3 months / 1 year per session, all time as monthly bests with
// programme blocks as subtle bands. Estimated-date points are hollow; the lifetime best is a reference line.

import { useMemo, useState } from "react";
import { groupBy, monthFromIndex, monthIndex, monthlyBests, type SessionBest, type WorkSet } from "../../lib/analysis";
import { addDays, daysBetween, fmtShortDate, fmtShortDateYear } from "../../lib/format";
import { AreaChart, Segmented, type Pt } from "../../ui/kit";
import { fmtMetric, fmtMonthYear } from "./format";
import type { Trend } from "./lifts";

export type Range = "3m" | "1y" | "all";
export const RANGES: { value: Range; label: string }[] = [
  { value: "3m", label: "3 months" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All" }
];

const EPOCH = "2015-01-01";

export function useRange(initial: Range = "1y") {
  return useState<Range>(initial);
}

export function RangeControl({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return <Segmented label="Range" value={value} options={RANGES} onChange={onChange} />;
}

/** The chart only; the caller places the title and range control. */
export function TrendChart({ trend, sets, range, today, height = 240, label }: {
  trend: Trend; sets: readonly WorkSet[]; range: Range; today: string; height?: number; label: string;
}) {
  const data = useMemo(() => {
    const est = new Set<number>();
    const labels = new Map<number, string>();
    let points: Pt[];
    let bands: { from: number; to: number }[] = [];
    let formatX: (x: number) => string;

    if (range === "all") {
      const months = monthlyBests(trend.bests);
      points = months.map((m) => {
        const x = monthIndex(m.period);
        if (m.confidence === "estimated") { est.add(x); labels.set(x, `${fmtMonthYear(m.period)} est.`); }
        return { x, y: m.value };
      });
      // Programme blocks that include this lift, as month ranges.
      bands = [...groupBy(sets, (s) => s.source).values()].map((list) => ({
        from: monthIndex(list[0]!.date) - 0.4, to: monthIndex(list[list.length - 1]!.date) + 0.4
      }));
      formatX = (x) => labels.get(x) ?? fmtMonthYear(monthFromIndex(Math.round(x)));
    } else {
      const from = addDays(today, range === "3m" ? -91 : -365);
      points = trend.bests.filter((b) => b.date >= from).map((b: SessionBest) => {
        const x = daysBetween(EPOCH, b.date);
        if (b.confidence === "estimated") { est.add(x); labels.set(x, `${fmtMonthYear(b.date)} est.`); }
        return { x, y: b.value };
      });
      const fmt = range === "3m" ? fmtShortDate : fmtShortDateYear;
      formatX = (x) => labels.get(x) ?? fmt(addDays(EPOCH, Math.round(x)));
    }

    const best = trend.best;
    const bestX = best ? (range === "all" ? monthIndex(best.date) : daysBetween(EPOCH, best.date)) : null;
    const markers = best && bestX != null && points.some((p) => p.x === bestX && Math.abs(p.y - best.value) < 1e-9)
      ? [{ x: bestX, y: best.value, label: `Best ${fmtMetric(best.value, trend.metric)}` }] : [];
    return { points, est, bands, formatX, markers };
  }, [trend, sets, range, today]);

  const best = trend.best?.value;
  return (
    <AreaChart
      label={label}
      height={height}
      series={[{ points: data.points, area: true, color: "var(--chart-1)", label, hollow: data.est.size ? (p) => data.est.has(p.x) : undefined }]}
      bands={data.bands}
      refs={best != null ? [{ y: best, label: `Best ${fmtMetric(best, trend.metric)}`, color: "var(--warm)" }] : []}
      markers={data.markers}
      formatX={data.formatX}
      formatY={(y) => fmtMetric(y, trend.metric)}
    />
  );
}

/** True when the chart for this range will show at least one estimated-date point. */
export function hasEstimated(trend: Trend, range: Range, today: string): boolean {
  if (range === "all") return monthlyBests(trend.bests).some((b) => b.confidence === "estimated");
  const from = addDays(today, range === "3m" ? -91 : -365);
  return trend.bests.some((b) => b.date >= from && b.confidence === "estimated");
}
