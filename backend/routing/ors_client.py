"""OpenRouteService client using the `driving-hgv` (heavy goods vehicle) profile.

Truck-aware: the gross vehicle weight is passed as a restriction so weight-limited
roads are avoided, and HGV speed limits drive the ETAs. ORS only offers built-in
alternatives for trips under 100 km, so alternatives come from the shared
detour-waypoint search, requested through ORS as via points.
"""

import logging

import requests
from django.conf import settings

from core.exceptions import NoRouteFound, UpstreamServiceError
from core.geo import haversine_miles

from .alternatives import LatLon, Route, fill_alternatives

logger = logging.getLogger(__name__)

PROFILE = "driving-hgv"
METERS_PER_MILE = 1609.344
# ORS error codes that mean "no route for these points" rather than "service problem".
NO_ROUTE_CODES = {2009, 2010, 2011}


def get_routes(origin: LatLon, destination: LatLon, gross_weight_tonnes: float) -> list[Route]:
    """Up to MAX_ROUTE_ALTERNATIVES distinct HGV routes, primary first."""
    routes = _request([origin, destination], gross_weight_tonnes)
    if not routes:
        raise NoRouteFound()
    return fill_alternatives(
        routes,
        origin,
        destination,
        settings.MAX_ROUTE_ALTERNATIVES,
        lambda via: _request([origin, via, destination], gross_weight_tonnes),
    )


def _request(waypoints: list[LatLon], gross_weight_tonnes: float) -> list[Route]:
    body = {
        "coordinates": [[lon, lat] for lat, lon in waypoints],
        "options": {"profile_params": {"restrictions": {"weight": round(gross_weight_tonnes, 2)}}},
        "instructions": True,
        "geometry_simplify": False,
    }
    try:
        response = requests.post(
            f"{settings.ORS_BASE_URL}/v2/directions/{PROFILE}/geojson",
            json=body,
            headers={"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"},
            timeout=settings.HTTP_TIMEOUT_SECONDS,
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("ORS request failed: %s", exc)
        raise UpstreamServiceError("Routing service is unavailable.") from exc

    error = payload.get("error")
    if error:
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else str(error)
        if code in NO_ROUTE_CODES:
            raise NoRouteFound()
        logger.warning("ORS returned %s (%s): %s", response.status_code, code, message)
        raise UpstreamServiceError(f"Routing service error: {message}")
    if response.status_code != 200:
        logger.warning("ORS returned HTTP %s", response.status_code)
        raise UpstreamServiceError("Routing service error.")

    return [_parse_feature(feature) for feature in payload.get("features", [])]


def _parse_feature(feature: dict) -> Route:
    coords: list[LatLon] = [(lat, lon) for lon, lat in feature["geometry"]["coordinates"]]
    props = feature["properties"]
    summary = props["summary"]

    segment_meters = [haversine_miles(*a, *b) * METERS_PER_MILE for a, b in zip(coords, coords[1:], strict=False)]
    segment_seconds = [0.0] * len(segment_meters)

    # Each step covers vertex range [a, b]; spread its duration over those segments by length.
    for segment in props.get("segments", []):
        for step in segment.get("steps", []):
            a, b = step["way_points"]
            span = segment_meters[a:b]
            total = sum(span)
            if total <= 0:
                continue
            for i, meters in enumerate(span, start=a):
                segment_seconds[i] += step["duration"] * meters / total

    return Route(
        coordinates=coords,
        segment_meters=segment_meters,
        segment_seconds=segment_seconds,
        distance_meters=float(summary["distance"]),
        duration_seconds=float(summary["duration"]),
    )
