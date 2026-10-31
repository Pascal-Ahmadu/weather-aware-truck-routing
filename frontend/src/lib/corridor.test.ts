import { describe, expect, it } from "vitest";

import type { Checkpoint, PlannedRoute } from "./api";
import { buildCorridorSegments } from "./corridor";

function checkpoint(index: number, lat: number, lon: number, geometryIndex: number): Checkpoint {
  return {
    index,
    mile: index * 25,
    lat,
    lon,
    geometry_index: geometryIndex,
    eta: "2026-11-01T12:00:00+00:00",
    segment_miles: 25,
    weather: null,
    risk: null,
    forecast: null,
  };
}

const route: PlannedRoute = {
  id: "route-0",
  rank: 1,
  recommended: true,
  distance_miles: 50,
  duration_seconds: 3600,
  eta: "",
  geometry: [
    [40, -100],
    [40, -99.8],
    [40, -99.6],
    [40, -99.4],
    [40, -99.2],
    [40, -99],
  ],
  summary: {
    no_travel_miles: 0,
    severe_miles: 0,
    high_miles: 0,
    moderate_miles: 0,
    low_miles: 50,
    unknown_miles: 0,
    average_risk: 0,
  },
  checkpoints: [
    checkpoint(0, 40, -100, 0),
    checkpoint(1, 40, -99.5, 2), // between vertices 2 and 3
    checkpoint(2, 40, -99, 5),
  ],
};

describe("buildCorridorSegments", () => {
  it("creates one segment per checkpoint pair following the road between them", () => {
    const segments = buildCorridorSegments(route);
    expect(segments.map((s) => s.key)).toEqual(["route-0:0", "route-0:1"]);
    expect(segments[0]!.positions).toEqual([
      [40, -100],
      [40, -99.8],
      [40, -99.6],
      [40, -99.5],
    ]);
    expect(segments[1]!.positions).toEqual([
      [40, -99.5],
      [40, -99.4],
      [40, -99.2],
      [40, -99],
      [40, -99],
    ]);
  });

  it("colours each stretch by the checkpoint at its start", () => {
    const segments = buildCorridorSegments(route);
    expect(segments.map((s) => s.checkpoint.index)).toEqual([0, 1]);
  });

  it("returns nothing for a route with a single checkpoint", () => {
    expect(buildCorridorSegments({ ...route, checkpoints: [checkpoint(0, 40, -100, 0)] })).toEqual([]);
  });
});
