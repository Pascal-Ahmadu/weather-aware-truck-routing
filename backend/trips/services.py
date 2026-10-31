"""Trip orchestration: geocode -> route -> sample checkpoints -> weather -> risk -> rank."""

import re
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings

from core.geo import haversine_miles, interpolate, meters_to_miles
from geocoding.client import Location, geocode
from recommendation.engine import ClassifiedSegment, RouteRiskSummary, rank_routes, summarize_route
from risk.engine import classify_checkpoint
from risk.types import RiskLevel
from routing.alternatives import Route
from routing.provider import get_routes, routing_info
from weather.client import HourlyForecast, LocationKey, get_hourly, location_key

LATLON_PATTERN = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
ONE_HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class PlanRequest:
    origin: str
    destination: str
    departure_time: datetime
    load_weight_lb: int
    checkpoint_interval_miles: int
    origin_coords: tuple[float, float] | None = None
    destination_coords: tuple[float, float] | None = None


@dataclass
class Checkpoint:
    index: int
    mile: float
    lat: float
    lon: float
    geometry_index: int  # route vertex this checkpoint lies on or just after
    seconds_from_departure: float
    segment_miles: float

    @property
    def key(self) -> LocationKey:
        return location_key(self.lat, self.lon)


def plan_trip(request: PlanRequest) -> dict:
    origin = resolve_location(request.origin, request.origin_coords)
    destination = resolve_location(request.destination, request.destination_coords)
    routes = get_routes((origin.lat, origin.lon), (destination.lat, destination.lon), request.load_weight_lb)

    checkpoints_per_route = [sample_checkpoints(route, request.checkpoint_interval_miles) for route in routes]

    forecast_start = _floor_hour(request.departure_time)
    latest_eta = max(request.departure_time + timedelta(seconds=route.duration_seconds) for route in routes)
    forecast_end = _ceil_hour(max(forecast_start + timedelta(hours=settings.FORECAST_WINDOW_HOURS), latest_eta))

    keys = {cp.key for cps in checkpoints_per_route for cp in cps}
    forecasts = get_hourly(keys, forecast_start, forecast_end)

    route_payloads = []
    summaries = []
    for i, (route, checkpoints) in enumerate(zip(routes, checkpoints_per_route, strict=True)):
        route_id = f"route-{i}"
        checkpoint_payloads = [
            _build_checkpoint(cp, forecasts.get(cp.key), request, forecast_start) for cp in checkpoints
        ]
        segments = [
            ClassifiedSegment(
                risk=RiskLevel(p["risk"]["level"]) if p["risk"] else None,
                miles=p["segment_miles"],
            )
            for p in checkpoint_payloads
        ]
        summary = summarize_route(route_id, route.duration_seconds, segments)
        summaries.append(summary)
        route_payloads.append(
            {
                "id": route_id,
                "distance_miles": round(meters_to_miles(route.distance_meters), 1),
                "duration_seconds": round(route.duration_seconds),
                "eta": (request.departure_time + timedelta(seconds=route.duration_seconds)).isoformat(),
                "geometry": [[round(lat, 5), round(lon, 5)] for lat, lon in route.coordinates],
                "summary": _summary_payload(summary),
                "checkpoints": checkpoint_payloads,
            }
        )

    ranked = rank_routes(summaries)
    rank_by_id = {s.route_id: rank for rank, s in enumerate(ranked, start=1)}
    for payload in route_payloads:
        payload["rank"] = rank_by_id[payload["id"]]
        payload["recommended"] = payload["rank"] == 1
    route_payloads.sort(key=lambda p: p["rank"])

    forecast_hours = [(forecast_start + i * ONE_HOUR).isoformat() for i in range(settings.FORECAST_WINDOW_HOURS + 1)]

    return {
        "query": {
            "origin": _location_payload(origin),
            "destination": _location_payload(destination),
            "departure_time": request.departure_time.isoformat(),
            "load_weight_lb": request.load_weight_lb,
            "checkpoint_interval_miles": request.checkpoint_interval_miles,
        },
        "forecast_hours": forecast_hours,
        "routing": routing_info(request.load_weight_lb),
        "routes": route_payloads,
        "recommended_route_id": ranked[0].route_id,
    }


def resolve_location(text: str, coords: tuple[float, float] | None = None) -> Location:
    if coords is not None:
        return Location(name=text, lat=coords[0], lon=coords[1])
    match = LATLON_PATTERN.match(text)
    if match:
        lat, lon = float(match.group(1)), float(match.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return Location(name=f"{lat:.5f}, {lon:.5f}", lat=lat, lon=lon)
    return geocode(text)


def sample_checkpoints(route: Route, interval_miles: float) -> list[Checkpoint]:
    """Checkpoints at mile 0, every `interval_miles`, and the destination.

    Positions and arrival times are interpolated along the road polyline using
    the router's per-segment distances and durations, so ETAs reflect the
    actual speed profile of the route rather than a flat average.
    """
    coords = route.coordinates
    if len(coords) < 2:
        return [Checkpoint(0, 0.0, coords[0][0], coords[0][1], 0, 0.0, 0.0)]

    seg_miles = _segment_miles(route)
    seg_seconds = _segment_seconds(route, seg_miles)

    cum_miles = [0.0]
    cum_seconds = [0.0]
    for miles, seconds in zip(seg_miles, seg_seconds, strict=True):
        cum_miles.append(cum_miles[-1] + miles)
        cum_seconds.append(cum_seconds[-1] + seconds)
    total_miles = cum_miles[-1]

    # Skip a regular mark that would land within a quarter interval of the destination
    # so the final checkpoint isn't duplicated.
    targets = [m for m in _multiples(interval_miles, total_miles) if m < total_miles - interval_miles * 0.25]
    targets.append(total_miles)

    checkpoints: list[Checkpoint] = []
    for index, target in enumerate(targets):
        lat, lon, seconds, vertex = _point_at(target, coords, cum_miles, cum_seconds)
        checkpoints.append(Checkpoint(index, round(target, 2), lat, lon, vertex, seconds, 0.0))

    for current, nxt in zip(checkpoints, checkpoints[1:], strict=False):
        current.segment_miles = round(nxt.mile - current.mile, 2)
    return checkpoints


def _multiples(step: float, limit: float) -> list[float]:
    values, value = [], 0.0
    while value <= limit:
        values.append(value)
        value += step
    return values


def _point_at(
    target_miles: float, coords: list[tuple[float, float]], cum_miles: list[float], cum_seconds: list[float]
) -> tuple[float, float, float, int]:
    """(lat, lon, seconds from departure, index of the vertex at or before the point)."""
    if target_miles >= cum_miles[-1]:
        lat, lon = coords[-1]
        return lat, lon, cum_seconds[-1], len(coords) - 1
    i = max(bisect_right(cum_miles, target_miles) - 1, 0)
    span = cum_miles[i + 1] - cum_miles[i]
    fraction = (target_miles - cum_miles[i]) / span if span > 0 else 0.0
    lat, lon = interpolate(*coords[i], *coords[i + 1], fraction)
    seconds = cum_seconds[i] + (cum_seconds[i + 1] - cum_seconds[i]) * fraction
    return lat, lon, seconds, i


def _segment_miles(route: Route) -> list[float]:
    n = len(route.coordinates) - 1
    if len(route.segment_meters) == n:
        return [meters_to_miles(m) for m in route.segment_meters]
    return [haversine_miles(*a, *b) for a, b in zip(route.coordinates, route.coordinates[1:], strict=False)]


def _segment_seconds(route: Route, seg_miles: list[float]) -> list[float]:
    if len(route.segment_seconds) == len(seg_miles):
        return route.segment_seconds
    # No per-segment timing from the router: spread total duration by distance.
    total = sum(seg_miles) or 1.0
    return [route.duration_seconds * m / total for m in seg_miles]


def _build_checkpoint(
    cp: Checkpoint, forecast: HourlyForecast | None, request: PlanRequest, forecast_start: datetime
) -> dict:
    eta = request.departure_time + timedelta(seconds=cp.seconds_from_departure)
    payload = {
        "index": cp.index,
        "mile": cp.mile,
        "lat": round(cp.lat, 5),
        "lon": round(cp.lon, 5),
        "geometry_index": cp.geometry_index,
        "eta": eta.isoformat(),
        "segment_miles": cp.segment_miles,
        "weather": None,
        "risk": None,
        "forecast": None,
    }
    if forecast is None:
        return payload

    eta_index = round((eta - forecast_start) / ONE_HOUR)
    reading = _reading_at(forecast, eta_index)
    if reading is not None:
        level = classify_checkpoint(*reading, request.load_weight_lb)
        payload["weather"] = {"wind_mph": reading[0], "rain_in_hr": reading[1], "snow_in_hr": reading[2]}
        payload["risk"] = {"level": int(level), "label": level.label}

    hours = settings.FORECAST_WINDOW_HOURS + 1
    series = [_reading_at(forecast, h) for h in range(hours)]
    payload["forecast"] = {
        "wind_mph": [r[0] if r else None for r in series],
        "rain_in_hr": [r[1] if r else None for r in series],
        "snow_in_hr": [r[2] if r else None for r in series],
        "risk": [int(classify_checkpoint(*r, request.load_weight_lb)) if r else None for r in series],
    }
    return payload


def _reading_at(forecast: HourlyForecast, index: int) -> tuple[float, float, float] | None:
    if index < 0 or index >= len(forecast.times):
        return None
    wind, rain, snow = forecast.wind_mph[index], forecast.rain_in_hr[index], forecast.snow_in_hr[index]
    if wind is None or rain is None or snow is None:
        return None
    return float(wind), float(rain), float(snow)


def _summary_payload(summary: RouteRiskSummary) -> dict:
    return {
        "no_travel_miles": round(summary.no_travel_miles, 1),
        "severe_miles": round(summary.severe_miles, 1),
        "high_miles": round(summary.high_miles, 1),
        "moderate_miles": round(summary.moderate_miles, 1),
        "low_miles": round(summary.low_miles, 1),
        "unknown_miles": round(summary.unknown_miles, 1),
        "average_risk": round(summary.average_risk, 2) if summary.average_risk is not None else None,
    }


def _location_payload(location: Location) -> dict:
    return {"name": location.name, "lat": location.lat, "lon": location.lon}


def _floor_hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


def _ceil_hour(dt: datetime) -> datetime:
    floored = _floor_hour(dt)
    return floored if floored == dt else floored + ONE_HOUR
