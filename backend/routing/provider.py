"""Chooses the routing provider: ORS driving-hgv when a key is configured, OSRM otherwise."""

import logging

from django.conf import settings

from core.exceptions import UpstreamServiceError

from . import client as osrm
from . import ors_client as ors
from .alternatives import LatLon, Route

logger = logging.getLogger(__name__)

LB_PER_TONNE = 2204.62


def active_provider() -> str:
    choice = settings.ROUTING_PROVIDER
    if choice == "auto":
        return "ors" if settings.ORS_API_KEY else "osrm"
    return choice


def gross_weight_lb(load_weight_lb: float) -> float:
    return load_weight_lb + settings.TRUCK_TARE_LB


def routing_info(load_weight_lb: float) -> dict:
    """What the plan was routed with, for the response and the UI."""
    provider = active_provider()
    if provider == "ors":
        return {
            "provider": "openrouteservice",
            "profile": "driving-hgv",
            "gross_weight_lb": gross_weight_lb(load_weight_lb),
        }
    return {"provider": "osrm", "profile": "car", "gross_weight_lb": None}


def get_routes(origin: LatLon, destination: LatLon, load_weight_lb: float) -> list[Route]:
    provider = active_provider()
    if provider == "ors":
        try:
            return ors.get_routes(origin, destination, gross_weight_lb(load_weight_lb) / LB_PER_TONNE)
        except UpstreamServiceError:
            if not settings.ROUTING_FALLBACK_TO_OSRM:
                raise
            logger.warning("ORS unavailable; falling back to OSRM car routing")
    return osrm.get_routes(origin, destination)
