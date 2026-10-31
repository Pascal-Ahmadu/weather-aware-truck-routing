"""Open-Meteo hourly forecast client.

One call returns the whole hourly window for a location, so a checkpoint's
ETA risk and its 0-48h heatmap series come from the same payload. Locations
are deduplicated on a ~1 km grid, cached, and batched (Open-Meteo accepts
comma-separated coordinate lists).
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import requests
from django.conf import settings
from django.core.cache import cache

from core.exceptions import UpstreamServiceError

logger = logging.getLogger(__name__)

GRID_DECIMALS = 2
BATCH_SIZE = 50
HOURLY_FIELDS = "wind_speed_10m,rain,snowfall"

LocationKey = tuple[float, float]


@dataclass(frozen=True)
class HourlyForecast:
    times: list[datetime]
    wind_mph: list[float | None]
    rain_in_hr: list[float | None]
    snow_in_hr: list[float | None]


def location_key(lat: float, lon: float) -> LocationKey:
    return round(lat, GRID_DECIMALS), round(lon, GRID_DECIMALS)


def get_hourly(keys: set[LocationKey], start: datetime, end: datetime) -> dict[LocationKey, HourlyForecast]:
    """Forecasts for every key between `start` and `end` (UTC, whole hours)."""
    window = (start.strftime("%Y-%m-%dT%H:%M"), end.strftime("%Y-%m-%dT%H:%M"))
    results: dict[LocationKey, HourlyForecast] = {}
    missing: list[LocationKey] = []

    for key in keys:
        cached = cache.get(_cache_key(key, window))
        if cached is not None:
            results[key] = cached
        else:
            missing.append(key)

    for i in range(0, len(missing), BATCH_SIZE):
        batch = missing[i : i + BATCH_SIZE]
        for key, forecast in zip(batch, _fetch_batch(batch, window), strict=True):
            cache.set(_cache_key(key, window), forecast, settings.WEATHER_CACHE_TTL_SECONDS)
            results[key] = forecast

    return results


def _fetch_batch(keys: list[LocationKey], window: tuple[str, str]) -> list[HourlyForecast]:
    params = {
        "latitude": ",".join(str(lat) for lat, _ in keys),
        "longitude": ",".join(str(lon) for _, lon in keys),
        "hourly": HOURLY_FIELDS,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "start_hour": window[0],
        "end_hour": window[1],
    }
    try:
        response = requests.get(
            f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params=params, timeout=settings.HTTP_TIMEOUT_SECONDS
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Weather request failed: %s", exc)
        raise UpstreamServiceError("Weather service is unavailable.") from exc

    if isinstance(payload, dict) and payload.get("error"):
        logger.warning("Weather service rejected request: %s", payload.get("reason"))
        raise UpstreamServiceError(f"Weather service error: {payload.get('reason')}")

    items = payload if isinstance(payload, list) else [payload]
    if len(items) != len(keys):
        raise UpstreamServiceError("Weather service returned an unexpected number of locations.")
    return [_parse_hourly(item["hourly"]) for item in items]


def _parse_hourly(hourly: dict) -> HourlyForecast:
    times = [datetime.fromisoformat(t).replace(tzinfo=UTC) for t in hourly["time"]]
    return HourlyForecast(
        times=times,
        wind_mph=hourly["wind_speed_10m"],
        rain_in_hr=hourly["rain"],
        snow_in_hr=hourly["snowfall"],
    )


def _cache_key(key: LocationKey, window: tuple[str, str]) -> str:
    return f"wx:{key[0]}:{key[1]}:{window[0]}:{window[1]}"
