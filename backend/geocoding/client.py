import logging
from dataclasses import dataclass

import requests
from django.conf import settings

from core.exceptions import LocationNotFound, UpstreamServiceError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Location:
    name: str
    lat: float
    lon: float


def geocode(query: str) -> Location:
    try:
        response = requests.get(
            f"{settings.NOMINATIM_BASE_URL}/search",
            params={"q": query, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=settings.HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Geocoding failed for %r: %s", query, exc)
        raise UpstreamServiceError("Geocoding service is unavailable.") from exc

    if not results:
        raise LocationNotFound(f"Could not find a location for '{query}'.")

    top = results[0]
    return Location(name=top.get("display_name", query), lat=float(top["lat"]), lon=float(top["lon"]))
