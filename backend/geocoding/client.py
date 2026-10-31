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


def suggest(query: str, limit: int = 5) -> list[Location]:
    """Type-ahead suggestions from Photon (built for autocomplete; Nominatim's policy forbids it)."""
    try:
        response = requests.get(
            f"{settings.PHOTON_BASE_URL}/api/",
            params={
                "q": query,
                "limit": limit,
                "lang": "en",
                "layer": ["city", "locality", "district", "county", "state", "house", "street"],
                # Proximity bias toward the continental US so "Chey" ranks Cheyenne, WY above villages abroad.
                "lat": settings.SUGGEST_BIAS_LAT,
                "lon": settings.SUGGEST_BIAS_LON,
                "zoom": 6,
                "location_bias_scale": 0.8,
            },
            # Photon returns 403 to the default python-requests agent; identify the app like we do for Nominatim.
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=settings.HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Suggest failed for %r: %s", query, exc)
        raise UpstreamServiceError("Location search is unavailable.") from exc

    # Photon ranks exact name matches above everything; keep its order but list the preferred country first.
    preferred = settings.SUGGEST_PREFERRED_COUNTRY
    features = sorted(features, key=lambda f: f.get("properties", {}).get("countrycode") != preferred)

    seen: set[str] = set()
    results: list[Location] = []
    for feature in features:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates")
        label = _photon_label(props)
        if not coords or not label or label in seen:
            continue
        seen.add(label)
        results.append(Location(name=label, lat=float(coords[1]), lon=float(coords[0])))
    return results


def _photon_label(props: dict) -> str:
    parts = []
    street = " ".join(p for p in (props.get("housenumber"), props.get("street")) if p)
    for part in (props.get("name"), street, props.get("city"), props.get("state"), props.get("country")):
        if part and part not in parts:
            parts.append(part)
    return ", ".join(parts)


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
