import type { Checkpoint, PlannedRoute } from "./api";

export interface CorridorSegment {
  key: string;
  routeId: string;
  /** Road geometry from this checkpoint to the next one. */
  positions: [number, number][];
  /** The checkpoint whose forecast colours this stretch of road. */
  checkpoint: Checkpoint;
}

/**
 * Splits a route's road geometry into one piece per checkpoint, computed once per
 * plan result. Colouring a piece for a given forecast hour is then a lookup in
 * `checkpoint.forecast.risk[hour]`, so the slider never recomputes geometry.
 */
export function buildCorridorSegments(route: PlannedRoute): CorridorSegment[] {
  const segments: CorridorSegment[] = [];
  const checkpoints = route.checkpoints;
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const from = checkpoints[i]!;
    const to = checkpoints[i + 1]!;
    const between = route.geometry.slice(from.geometry_index + 1, to.geometry_index + 1);
    segments.push({
      key: `${route.id}:${from.index}`,
      routeId: route.id,
      positions: [[from.lat, from.lon], ...between, [to.lat, to.lon]],
      checkpoint: from,
    });
  }
  return segments;
}
