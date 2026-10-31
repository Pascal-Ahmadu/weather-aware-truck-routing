import { describe, expect, it } from "vitest";

import type { Checkpoint, PlannedRoute, RouteSummary } from "./api";
import { explainRecommendation, worstRiskAtEta, worstRiskByHour } from "./explain";

const base: RouteSummary = {
  no_travel_miles: 0,
  severe_miles: 0,
  high_miles: 0,
  moderate_miles: 0,
  low_miles: 100,
  unknown_miles: 0,
  average_risk: 0,
};

function route(id: string, duration: number, summary: Partial<RouteSummary> = {}, checkpoints: Checkpoint[] = []): PlannedRoute {
  return {
    id,
    rank: 1,
    recommended: id === "a",
    distance_miles: 100,
    duration_seconds: duration,
    eta: "",
    geometry: [],
    summary: { ...base, ...summary },
    checkpoints,
  };
}

function cp(level: 0 | 1 | 2 | 3 | 4 | null, forecast: (0 | 1 | 2 | 3 | 4 | null)[]): Checkpoint {
  return {
    index: 0,
    mile: 0,
    lat: 0,
    lon: 0,
    geometry_index: 0,
    eta: "",
    segment_miles: 25,
    weather: null,
    risk: level === null ? null : { level, label: "" },
    forecast: { wind_mph: [], rain_in_hr: [], snow_in_hr: [], risk: forecast },
  };
}

describe("explainRecommendation", () => {
  it("calls out a clean, fastest route", () => {
    const a = route("a", 3600);
    const b = route("b", 4000, { high_miles: 25 });
    expect(explainRecommendation(a, [a, b])).toEqual(["No Severe or High weather at your ETAs", "Fastest option"]);
  });

  it("explains a slower but safer winner with the numbers", () => {
    const a = route("a", 4000, { severe_miles: 10 });
    const b = route("b", 3600, { severe_miles: 40 });
    expect(explainRecommendation(a, [a, b])).toEqual([
      "Fewest Severe miles (10 vs 40)",
      "7 min longer than the fastest, for lower risk",
    ]);
  });

  it("mentions avoiding No Travel when another route has it", () => {
    const a = route("a", 4000, { high_miles: 5 });
    const b = route("b", 3600, { no_travel_miles: 12 });
    expect(explainRecommendation(a, [a, b])[0]).toBe("Avoids every No Travel stretch");
  });

  it("handles a single route honestly", () => {
    const a = route("a", 3600);
    expect(explainRecommendation(a, [a])).toEqual(["No Severe or High weather at your ETAs", "Only drivable route found"]);
  });
});

describe("worst risk helpers", () => {
  it("finds the worst ETA risk and ignores unknowns", () => {
    expect(worstRiskAtEta(route("a", 1, {}, [cp(0, []), cp(null, []), cp(3, [])]))).toBe(3);
    expect(worstRiskAtEta(route("a", 1, {}, [cp(null, [])]))).toBeNull();
  });

  it("builds an hourly worst-case series across checkpoints", () => {
    const r = route("a", 1, {}, [cp(0, [0, 2, null]), cp(0, [1, 1, 4])]);
    expect(worstRiskByHour(r, 3)).toEqual([1, 2, 4]);
    expect(worstRiskByHour(route("a", 1), 2)).toEqual([null, null]);
  });
});
