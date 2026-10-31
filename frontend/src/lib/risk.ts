import type { RiskLevelValue, RouteSummary } from "./api";

export interface RiskMeta {
  level: RiskLevelValue;
  label: string;
  color: string;
}

export const RISK_LEVELS: readonly RiskMeta[] = [
  { level: 0, label: "Low", color: "#2e9e5b" },
  { level: 1, label: "Moderate", color: "#e0b300" },
  { level: 2, label: "High", color: "#f0821e" },
  { level: 3, label: "Severe", color: "#d7263d" },
  { level: 4, label: "No Travel", color: "#6a0dad" },
];

export const UNKNOWN_RISK_COLOR = "#9aa0a6";

export function riskColor(level: RiskLevelValue | null | undefined): string {
  return (level == null ? undefined : RISK_LEVELS[level]?.color) ?? UNKNOWN_RISK_COLOR;
}

export function riskLabel(level: RiskLevelValue | null | undefined): string {
  return (level == null ? undefined : RISK_LEVELS[level]?.label) ?? "Unknown";
}

/** Heat intensity on a 0-1 scale that lines up with HEAT_GRADIENT stops. */
export function heatIntensity(level: RiskLevelValue): number {
  return (level + 1) / RISK_LEVELS.length;
}

export const HEAT_GRADIENT: Record<number, string> = Object.fromEntries(
  RISK_LEVELS.map((meta) => [heatIntensity(meta.level), meta.color]),
);

export interface SummaryBand {
  level: RiskLevelValue | null;
  miles: number;
}

export function summaryBands(summary: RouteSummary): SummaryBand[] {
  const bands: SummaryBand[] = [
    { level: 0, miles: summary.low_miles },
    { level: 1, miles: summary.moderate_miles },
    { level: 2, miles: summary.high_miles },
    { level: 3, miles: summary.severe_miles },
    { level: 4, miles: summary.no_travel_miles },
    { level: null, miles: summary.unknown_miles },
  ];
  return bands.filter((band) => band.miles > 0);
}
