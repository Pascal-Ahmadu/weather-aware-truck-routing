import type { Page } from "@playwright/test";

type Level = 0 | 1 | 2 | 3 | 4;

const HOURS = 49;
const DEPARTURE = new Date("2026-11-01T15:00:00Z");

function hours(): string[] {
  return Array.from({ length: HOURS }, (_, h) => new Date(DEPARTURE.getTime() + h * 3600_000).toISOString());
}

interface RouteSpec {
  id: string;
  rank: number;
  lat: number;
  distanceMiles: number;
  durationHours: number;
  /** Risk at ETA per checkpoint and the hourly series used by the sparkline. */
  risks: Level[];
  series: (h: number) => Level;
}

function route(spec: RouteSpec) {
  const count = spec.risks.length;
  const geometry: [number, number][] = Array.from({ length: (count - 1) * 10 + 1 }, (_, i) => [
    spec.lat,
    -104.99 + (i / ((count - 1) * 10)) * (-111.89 + 104.99),
  ]);
  const segment = spec.distanceMiles / (count - 1);
  const checkpoints = spec.risks.map((level, index) => {
    const eta = new Date(DEPARTURE.getTime() + (spec.durationHours * 3600_000 * index) / (count - 1));
    const series = Array.from({ length: HOURS }, (_, h) => spec.series(h));
    return {
      index,
      mile: Math.round(segment * index),
      lat: spec.lat,
      lon: geometry[index * 10]![1],
      geometry_index: index * 10,
      eta: eta.toISOString(),
      segment_miles: index === count - 1 ? 0 : segment,
      weather: { wind_mph: 10 + level * 12, rain_in_hr: 0, snow_in_hr: 0 },
      risk: { level, label: ["Low", "Moderate", "High", "Severe", "No Travel"][level] },
      forecast: { wind_mph: series.map((l) => 10 + l * 12), rain_in_hr: series.map(() => 0), snow_in_hr: series.map(() => 0), risk: series },
    };
  });
  const miles = (lvl: Level) => checkpoints.filter((c) => c.risk.level === lvl).reduce((s, c) => s + c.segment_miles, 0);
  return {
    id: spec.id,
    rank: spec.rank,
    recommended: spec.rank === 1,
    distance_miles: spec.distanceMiles,
    duration_seconds: spec.durationHours * 3600,
    eta: new Date(DEPARTURE.getTime() + spec.durationHours * 3600_000).toISOString(),
    geometry,
    summary: {
      no_travel_miles: miles(4),
      severe_miles: miles(3),
      high_miles: miles(2),
      moderate_miles: miles(1),
      low_miles: miles(0),
      unknown_miles: 0,
      average_risk: 0.4,
    },
    checkpoints,
  };
}

export const PLAN_FIXTURE = {
  query: {
    origin: { name: "Denver, Colorado, United States", lat: 39.7392, lon: -104.9903 },
    destination: { name: "Salt Lake City, Utah, United States", lat: 40.7608, lon: -111.891 },
    departure_time: DEPARTURE.toISOString(),
    load_weight_lb: 42000,
    checkpoint_interval_miles: 25,
  },
  forecast_hours: hours(),
  routing: { provider: "openrouteservice", profile: "driving-hgv", gross_weight_lb: 75000 },
  recommended_route_id: "route-1",
  routes: [
    route({
      id: "route-1",
      rank: 1,
      lat: 41.0,
      distanceMiles: 520,
      durationHours: 11,
      risks: [0, 0, 1, 0, 0, 0],
      series: (h) => (h >= 24 && h < 30 ? 1 : 0),
    }),
    route({
      id: "route-0",
      rank: 2,
      lat: 39.6,
      distanceMiles: 480,
      durationHours: 9,
      risks: [0, 2, 3, 3, 0, 0],
      series: (h) => (h >= 18 && h < 32 ? 3 : h >= 32 && h < 36 ? 4 : 0),
    }),
  ],
};

export const SUGGEST_FIXTURE = {
  results: [
    { name: "Cheyenne, Wyoming, United States", lat: 41.14, lon: -104.82 },
    { name: "Cheyenne, Colorado, United States", lat: 38.8, lon: -104.0 },
  ],
};

/** Stub every API call so the suite is deterministic and runs offline in CI. */
export async function mockApi(page: Page, { planDelayMs = 300 } = {}) {
  await page.route("**/api/trips/plan/", async (routeHandler) => {
    await new Promise((resolve) => setTimeout(resolve, planDelayMs));
    await routeHandler.fulfill({ json: PLAN_FIXTURE });
  });
  await page.route("**/api/geocode/suggest/**", (routeHandler) => routeHandler.fulfill({ json: SUGGEST_FIXTURE }));
  // Map tiles are irrelevant to the assertions and slow in CI.
  await page.route("**/arcgisonline.com/**", (routeHandler) => routeHandler.abort());
}
