"""OSRM routing client (car profile; keyless fallback). See `routing.provider` for selection."""

import logging

import requests
from django.conf import settings

from core.exceptions import NoRouteFound, UpstreamServiceError

from .alternatives import LatLon, Route, consider, fill_alternatives

logger = logging.getLogger(__name__)

__all__ = ["LatLon", "Route", "get_routes"]


def get_routes(origin: LatLon, destination: LatLon) -> list[Route]:
    """Up to MAX_ROUTE_ALTERNATIVES distinct driving routes, primary (fastest) first."""
    limit = settings.MAX_ROUTE_ALTERNATIVES
    routes: list[Route] = []
    for candidate in _request([origin, destination], alternatives=limit):
        consider(routes, candidate, limit)
    if not routes:
        raise NoRouteFound()
    return fill_alternatives(
        routes, origin, destination, limit, lambda via: _request([origin, via, destination], alternatives=0)
    )


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
