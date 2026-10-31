"""OSRM routing client.

OSRM's own `alternatives` often yields a single route on long interstate trips,
so when it comes up short we request routes through detour waypoints offset to
either side of the primary route until MAX_ROUTE_ALTERNATIVES is reached.
Every candidate must be genuinely different from what we already have, not
absurdly slower than the primary, and not an out-and-back spur (which is what a
detour waypoint on a dead-end road produces). The public OSRM server does not
support `exclude=` classes, so that is not used as a source of alternatives.
"""

import logging
from collections import Counter
from dataclasses import dataclass
from math import atan2, cos, degrees, radians, sin

import requests
from django.conf import settings

from core.exceptions import NoRouteFound, UpstreamServiceError
from core.geo import meters_to_miles

logger = logging.getLogger(__name__)

LatLon = tuple[float, float]

MAX_DETOUR_DURATION_FACTOR = 1.5
MAX_OVERLAP_FOR_DISTINCT = 0.80
# Real routes retrace a little (interchanges, city loops), so spurs are judged relative to the primary.
MAX_RETRACE_EXCESS = 0.04
DETOUR_FRACTIONS = (0.5, 1 / 3, 2 / 3, 0.25, 0.75)
DETOUR_FRACTION_OF_TRIP = 0.12
DETOUR_MIN_MILES, DETOUR_MAX_MILES = 8.0, 50.0
OVERLAP_GRID_DEGREES = 0.02  # ~2 km cells
MILES_PER_DEGREE_LAT = 69.0


@dataclass(frozen=True)
class Route:
    """Road geometry plus per-segment distance/duration between consecutive vertices."""

    coordinates: list[LatLon]
    segment_meters: list[float]  # len == len(coordinates) - 1 when the router provides annotations
    segment_seconds: list[float]
    distance_meters: float
    duration_seconds: float


def get_routes(origin: LatLon, destination: LatLon) -> list[Route]:
    """Up to MAX_ROUTE_ALTERNATIVES distinct driving routes, primary (fastest) first."""
    limit = settings.MAX_ROUTE_ALTERNATIVES
    routes: list[Route] = []

    for candidate in _request([origin, destination], alternatives=limit):
        _consider(routes, candidate, limit)
    if not routes:
        raise NoRouteFound()
    primary = routes[0]

    for via in _detour_points(primary, origin, destination):
        if len(routes) >= limit:
            break
        try:
            candidates = _request([origin, via, destination], alternatives=0)
        except (NoRouteFound, UpstreamServiceError) as exc:
            logger.info("Detour via %s skipped: %s", via, exc)
            continue
        for candidate in candidates:
            _consider(routes, candidate, limit, primary)

    return routes


def _request(waypoints: list[LatLon], *, alternatives: int) -> list[Route]:
    path = ";".join(f"{lon},{lat}" for lat, lon in waypoints)
    params = {
        "alternatives": alternatives if alternatives > 1 else "false",
        "overview": "full",
        "geometries": "geojson",
        "annotations": "distance,duration",
        "steps": "false",
    }
    try:
        response = requests.get(
            f"{settings.OSRM_BASE_URL}/route/v1/driving/{path}", params=params, timeout=settings.HTTP_TIMEOUT_SECONDS
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Routing request failed: %s", exc)
        raise UpstreamServiceError("Routing service is unavailable.") from exc

    code = payload.get("code")
    if code == "NoRoute":
        raise NoRouteFound()
    if code != "Ok":
        logger.warning("Routing returned %s: %s", code, payload.get("message"))
        raise UpstreamServiceError(f"Routing service error: {payload.get('message', code)}")
    return [_parse_route(raw) for raw in payload.get("routes", [])]


def _parse_route(raw: dict) -> Route:
    coords = [(lat, lon) for lon, lat in raw["geometry"]["coordinates"]]
    segment_meters: list[float] = []
    segment_seconds: list[float] = []
    for leg in raw["legs"]:
        annotation = leg.get("annotation", {})
        segment_meters.extend(float(d) for d in annotation.get("distance", []))
        segment_seconds.extend(float(d) for d in annotation.get("duration", []))
    return Route(
        coordinates=coords,
        segment_meters=segment_meters,
        segment_seconds=segment_seconds,
        distance_meters=float(raw["distance"]),
        duration_seconds=float(raw["duration"]),
    )


def _consider(routes: list[Route], candidate: Route, limit: int, primary: Route | None = None) -> None:
    if len(routes) >= limit:
        return
    if primary is not None:
        if candidate.duration_seconds > primary.duration_seconds * MAX_DETOUR_DURATION_FACTOR:
            return
        if _retrace_fraction(candidate) - _retrace_fraction(primary) > MAX_RETRACE_EXCESS:
            return
    if any(_overlap(candidate, existing) >= MAX_OVERLAP_FOR_DISTINCT for existing in routes):
        return
    routes.append(candidate)


def _overlap(candidate: Route, existing: Route) -> float:
    """Fraction of the candidate's ~2 km grid cells that the existing route also passes through."""
    existing_cells = {_cell(p) for p in existing.coordinates}
    candidate_cells = {_cell(p) for p in candidate.coordinates}
    if not candidate_cells:
        return 1.0
    return len(candidate_cells & existing_cells) / len(candidate_cells)


def _retrace_fraction(route: Route) -> float:
    """Share of the route's path that drives through a cell it already visited (out-and-back spurs)."""
    path: list[tuple[int, int]] = []
    for point in route.coordinates:
        cell = _cell(point)
        if not path or path[-1] != cell:
            path.append(cell)
    if not path:
        return 0.0
    visits = Counter(path)
    return sum(1 for cell in path if visits[cell] > 1) / len(path)


def _cell(point: LatLon) -> tuple[int, int]:
    return round(point[0] / OVERLAP_GRID_DEGREES), round(point[1] / OVERLAP_GRID_DEGREES)


def _detour_points(primary: Route, origin: LatLon, destination: LatLon) -> list[LatLon]:
    """Points offset perpendicular to the trip, either side of the route, mid-trip first."""
    offset_miles = min(
        max(meters_to_miles(primary.distance_meters) * DETOUR_FRACTION_OF_TRIP, DETOUR_MIN_MILES), DETOUR_MAX_MILES
    )
    bearing = _bearing(origin, destination)
    points = []
    n = len(primary.coordinates)
    for fraction in DETOUR_FRACTIONS:
        anchor = primary.coordinates[min(int(n * fraction), n - 1)]
        for side in (90.0, -90.0):
            points.append(_offset(anchor, bearing + side, offset_miles))
    return points


def _bearing(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    x = sin(lon2 - lon1) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(lon2 - lon1)
    return degrees(atan2(x, y))


def _offset(point: LatLon, bearing_deg: float, miles: float) -> LatLon:
    lat, lon = point
    d_lat = miles * cos(radians(bearing_deg)) / MILES_PER_DEGREE_LAT
    d_lon = miles * sin(radians(bearing_deg)) / (MILES_PER_DEGREE_LAT * max(cos(radians(lat)), 0.1))
    return round(lat + d_lat, 5), round(lon + d_lon, 5)
