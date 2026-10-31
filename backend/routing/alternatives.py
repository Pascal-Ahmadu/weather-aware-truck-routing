"""Provider-agnostic alternative-route search.

Routers rarely return three distinct routes on long interstate trips, so we ask
for routes through detour waypoints offset to either side of the primary route
until MAX_ROUTE_ALTERNATIVES is reached. Every candidate must be genuinely
different from what we already have, not absurdly slower than the primary, and
not an out-and-back spur (what a detour waypoint on a dead-end road produces).
"""

import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from math import atan2, cos, degrees, radians, sin

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
    segment_meters: list[float]  # len == len(coordinates) - 1 when the router provides timing
    segment_seconds: list[float]
    distance_meters: float
    duration_seconds: float


def fill_alternatives(
    routes: list[Route],
    origin: LatLon,
    destination: LatLon,
    limit: int,
    request_via: Callable[[LatLon], list[Route]],
) -> list[Route]:
    """Extend `routes` (primary first) with distinct detour routes until `limit`."""
    primary = routes[0]
    for via in detour_points(primary, origin, destination):
        if len(routes) >= limit:
            break
        try:
            candidates = request_via(via)
        except (NoRouteFound, UpstreamServiceError) as exc:
            logger.info("Detour via %s skipped: %s", via, exc)
            continue
        for candidate in candidates:
            consider(routes, candidate, limit, primary)
    return routes


def consider(routes: list[Route], candidate: Route, limit: int, primary: Route | None = None) -> None:
    if len(routes) >= limit:
        return
    if primary is not None:
        if candidate.duration_seconds > primary.duration_seconds * MAX_DETOUR_DURATION_FACTOR:
            return
        if retrace_fraction(candidate) - retrace_fraction(primary) > MAX_RETRACE_EXCESS:
            return
    if any(overlap(candidate, existing) >= MAX_OVERLAP_FOR_DISTINCT for existing in routes):
        return
    routes.append(candidate)


def overlap(candidate: Route, existing: Route) -> float:
    """Fraction of the candidate's ~2 km grid cells that the existing route also passes through."""
    existing_cells = {_cell(p) for p in existing.coordinates}
    candidate_cells = {_cell(p) for p in candidate.coordinates}
    if not candidate_cells:
        return 1.0
    return len(candidate_cells & existing_cells) / len(candidate_cells)


def retrace_fraction(route: Route) -> float:
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


def detour_points(primary: Route, origin: LatLon, destination: LatLon) -> list[LatLon]:
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


def _cell(point: LatLon) -> tuple[int, int]:
    return round(point[0] / OVERLAP_GRID_DEGREES), round(point[1] / OVERLAP_GRID_DEGREES)


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
