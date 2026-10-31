import type { PlannedRoute, RiskLevelValue } from "./api";
import { formatDuration } from "./format";

/** Short, honest reasons a route ranked where it did, derived from the same numbers the ranking used. */
export function explainRecommendation(route: PlannedRoute, routes: PlannedRoute[]): string[] {
  const others = routes.filter((r) => r.id !== route.id);
  const reasons: string[] = [];
  const s = route.summary;

  if (s.no_travel_miles === 0 && others.some((o) => o.summary.no_travel_miles > 0)) {
    reasons.push("Avoids every No Travel stretch");
  }

  if (s.severe_miles === 0 && s.high_miles === 0) {
    reasons.push("No Severe or High weather at your ETAs");
  } else if (others.length > 0) {
    const minSevere = Math.min(...others.map((o) => o.summary.severe_miles));
    const minHigh = Math.min(...others.map((o) => o.summary.high_miles));
    if (s.severe_miles < minSevere) reasons.push(`Fewest Severe miles (${s.severe_miles} vs ${minSevere})`);
    else if (s.severe_miles === minSevere && s.high_miles < minHigh) {
      reasons.push(`Fewest High miles (${s.high_miles} vs ${minHigh})`);
    }
  }

  const fastest = Math.min(...routes.map((r) => r.duration_seconds));
  if (route.duration_seconds === fastest) {
    reasons.push(others.length ? "Fastest option" : "Only drivable route found");
  } else if (route.recommended) {
    reasons.push(`${formatDuration(route.duration_seconds - fastest)} longer than the fastest, for lower risk`);
  }

  return reasons.slice(0, 2);
}

/** Worst checkpoint risk at ETA along a route, or null when nothing is known. */
export function worstRiskAtEta(route: PlannedRoute): RiskLevelValue | null {
  let worst: RiskLevelValue | null = null;
  for (const cp of route.checkpoints) {
    const level = cp.risk?.level;
    if (level != null && (worst === null || level > worst)) worst = level;
  }
  return worst;
}

/** For each forecast hour, the worst risk anywhere along the route (drives the slider sparkline). */
export function worstRiskByHour(route: PlannedRoute, hourCount: number): (RiskLevelValue | null)[] {
  const series: (RiskLevelValue | null)[] = Array.from({ length: hourCount }, () => null);
  for (const cp of route.checkpoints) {
    const risks = cp.forecast?.risk;
    if (!risks) continue;
    for (let h = 0; h < hourCount; h++) {
      const level = risks[h];
      if (level == null) continue;
      const current = series[h];
      if (current === null || current === undefined || level > current) series[h] = level;
    }
  }
  return series;
}
