export type RiskLevelValue = 0 | 1 | 2 | 3 | 4;

export interface LocationInfo {
  name: string;
  lat: number;
  lon: number;
}

export interface WeatherReading {
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
}

export interface CheckpointForecast {
  wind_mph: (number | null)[];
  rain_in_hr: (number | null)[];
  snow_in_hr: (number | null)[];
  risk: (RiskLevelValue | null)[];
}

export interface Checkpoint {
  index: number;
  mile: number;
  lat: number;
  lon: number;
  /** Index of the route geometry vertex this checkpoint lies on or just after. */
  geometry_index: number;
  eta: string;
  segment_miles: number;
  weather: WeatherReading | null;
  risk: { level: RiskLevelValue; label: string } | null;
  forecast: CheckpointForecast | null;
}

export interface RouteSummary {
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  moderate_miles: number;
  low_miles: number;
  unknown_miles: number;
  average_risk: number | null;
}

export interface PlannedRoute {
  id: string;
  rank: number;
  recommended: boolean;
  distance_miles: number;
  duration_seconds: number;
  eta: string;
  geometry: [number, number][];
  summary: RouteSummary;
  checkpoints: Checkpoint[];
}

export interface PlanResponse {
  query: {
    origin: LocationInfo;
    destination: LocationInfo;
    departure_time: string;
    load_weight_lb: number;
    checkpoint_interval_miles: number;
  };
  forecast_hours: string[];
  routing: {
    provider: "openrouteservice" | "osrm";
    profile: "driving-hgv" | "car";
    gross_weight_lb: number | null;
  };
  routes: PlannedRoute[];
  recommended_route_id: string;
}

export interface LocationSuggestion {
  name: string;
  lat: number;
  lon: number;
}

export interface PlanRequest {
  origin: string;
  destination: string;
  /** [lat, lon] when the user picked a suggestion; lets the API skip re-geocoding the label. */
  origin_coords?: [number, number] | null;
  destination_coords?: [number, number] | null;
  departure_time: string;
  load_weight_lb: number;
  checkpoint_interval_miles: 10 | 25 | 50;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function planTrip(request: PlanRequest, signal?: AbortSignal): Promise<PlanResponse> {
  const response = await fetch(`${API_BASE_URL}/api/trips/plan/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as PlanResponse;
}

export async function suggestLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const response = await fetch(`${API_BASE_URL}/api/geocode/suggest/?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return ((await response.json()) as { results: LocationSuggestion[] }).results;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, "http_error", `Request failed (${response.status}).`);
  }

  const error = (body as { error?: { code?: string; detail?: unknown } }).error;
  const detail = error?.detail;
  if (typeof detail === "string") {
    return new ApiError(response.status, error?.code ?? "error", detail);
  }
  if (detail && typeof detail === "object") {
    const fieldErrors = Object.fromEntries(
      Object.entries(detail as Record<string, unknown>).map(([field, messages]) => [
        field,
        Array.isArray(messages) ? messages.map(String) : [String(messages)],
      ]),
    );
    const first = Object.values(fieldErrors)[0]?.[0];
    return new ApiError(response.status, error?.code ?? "invalid", first ?? "Invalid input.", fieldErrors);
  }
  return new ApiError(response.status, error?.code ?? "error", `Request failed (${response.status}).`);
}
