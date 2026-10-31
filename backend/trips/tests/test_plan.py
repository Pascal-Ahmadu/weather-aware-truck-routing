from datetime import UTC, datetime, timedelta

import pytest
from rest_framework.test import APIClient

from core.exceptions import UpstreamServiceError
from core.geo import METERS_PER_MILE
from geocoding.client import Location
from routing.client import Route
from weather.client import HourlyForecast

DEPARTURE = datetime(2026, 11, 1, 12, 30, tzinfo=UTC)


def straight_route(total_miles: float, seconds_per_mile: float, lat: float = 40.0) -> Route:
    vertices = int(total_miles) + 1
    coords = [(lat, -100.0 + i / 55.0) for i in range(vertices)]
    return Route(
        coords,
        [METERS_PER_MILE] * (vertices - 1),
        [seconds_per_mile] * (vertices - 1),
        total_miles * METERS_PER_MILE,
        total_miles * seconds_per_mile,
    )


def forecast(start: datetime, hours: int, wind=5.0, rain=0.0, snow=0.0, *, wind_at: dict[int, float] | None = None):
    winds = [wind] * hours
    for hour, value in (wind_at or {}).items():
        winds[hour] = value
    return HourlyForecast(
        times=[start + timedelta(hours=h) for h in range(hours)],
        wind_mph=winds,
        rain_in_hr=[rain] * hours,
        snow_in_hr=[snow] * hours,
    )


@pytest.fixture
def providers(mocker, settings):
    """Mock every third-party call; tests configure the returned data."""
    mocker.patch("django.utils.timezone.now", return_value=DEPARTURE - timedelta(hours=2))
    geocode = mocker.patch(
        "trips.services.geocode",
        side_effect=lambda q: Location(name=f"Resolved {q}", lat=40.0, lon=-100.0 if q == "A" else -98.0),
    )
    routes = mocker.patch("trips.services.get_routes")
    weather = mocker.patch("trips.services.get_hourly")
    return {"geocode": geocode, "routes": routes, "weather": weather}


def post_plan(client, **overrides):
    body = {
        "origin": "A",
        "destination": "B",
        "departure_time": DEPARTURE.isoformat(),
        "load_weight_lb": 20_000,
        "checkpoint_interval_miles": 25,
        **overrides,
    }
    return client.post("/api/trips/plan/", body, format="json")


@pytest.mark.django_db
def test_plan_ranks_safer_route_above_faster_one(providers):
    fast_windy = straight_route(100, seconds_per_mile=50, lat=40.0)
    slow_calm = straight_route(100, seconds_per_mile=70, lat=41.0)
    providers["routes"].return_value = [fast_windy, slow_calm]

    forecast_start = DEPARTURE.replace(minute=0)

    def hourly(keys, start, end):
        assert start == forecast_start
        # route-0 (lat 40) gets 50 mph wind at hours 1-2, which is when its mile-50/75 checkpoints arrive.
        return {
            key: forecast(start, 60, wind_at={1: 50.0, 2: 50.0}) if key[0] == 40.0 else forecast(start, 60)
            for key in keys
        }

    providers["weather"].side_effect = hourly

    response = post_plan(APIClient())
    assert response.status_code == 200, response.json()
    data = response.json()

    assert data["recommended_route_id"] == "route-1"
    by_id = {r["id"]: r for r in data["routes"]}
    assert by_id["route-1"]["rank"] == 1 and by_id["route-1"]["recommended"] is True
    assert by_id["route-0"]["rank"] == 2
    assert by_id["route-0"]["summary"]["severe_miles"] > 0
    assert by_id["route-1"]["summary"]["severe_miles"] == 0
    assert data["routes"][0]["id"] == "route-1"  # sorted best-first


@pytest.mark.django_db
def test_checkpoint_uses_forecast_hour_nearest_its_eta(providers):
    providers["routes"].return_value = [straight_route(100, seconds_per_mile=72)]  # 50 mph -> mile 50 at +60 min
    providers["weather"].side_effect = lambda keys, start, end: {
        key: forecast(start, 60, wind_at={2: 40.0})
        for key in keys  # 12:00 + 2h = 14:00
    }

    data = post_plan(APIClient()).json()
    checkpoints = data["routes"][0]["checkpoints"]
    mile_50 = next(cp for cp in checkpoints if cp["mile"] == 50)
    mile_75 = next(cp for cp in checkpoints if cp["mile"] == 75)

    assert mile_50["eta"] == "2026-11-01T13:30:00+00:00"  # rounds to 14:00 -> index 2 -> 40 mph
    assert mile_50["weather"]["wind_mph"] == 40.0
    assert mile_50["risk"] == {"level": 2, "label": "High"}
    assert mile_75["eta"] == "2026-11-01T14:00:00+00:00"
    assert mile_75["risk"]["label"] == "High"
    assert checkpoints[0]["risk"]["label"] == "Low"


@pytest.mark.django_db
def test_load_weight_escalates_risk_in_eta_and_heatmap_series(providers):
    providers["routes"].return_value = [straight_route(10, seconds_per_mile=60)]
    providers["weather"].side_effect = lambda keys, start, end: {key: forecast(start, 60, wind=50.0) for key in keys}

    light = post_plan(APIClient(), load_weight_lb=20_000).json()
    heavy = post_plan(APIClient(), load_weight_lb=35_000).json()

    assert light["routes"][0]["checkpoints"][0]["risk"]["label"] == "Severe"
    assert heavy["routes"][0]["checkpoints"][0]["risk"]["label"] == "No Travel"
    assert set(light["routes"][0]["checkpoints"][0]["forecast"]["risk"]) == {3}
    assert set(heavy["routes"][0]["checkpoints"][0]["forecast"]["risk"]) == {4}
    assert heavy["routes"][0]["summary"]["no_travel_miles"] == 10.0


@pytest.mark.django_db
def test_forecast_series_has_49_hours_and_response_lists_them(providers):
    providers["routes"].return_value = [straight_route(10, seconds_per_mile=60)]
    providers["weather"].side_effect = lambda keys, start, end: {key: forecast(start, 60) for key in keys}

    data = post_plan(APIClient()).json()
    assert len(data["forecast_hours"]) == 49
    assert data["forecast_hours"][0] == "2026-11-01T12:00:00+00:00"
    assert len(data["routes"][0]["checkpoints"][0]["forecast"]["risk"]) == 49


@pytest.mark.django_db
def test_missing_weather_is_reported_as_unknown_not_low(providers):
    providers["routes"].return_value = [straight_route(50, seconds_per_mile=60)]
    providers["weather"].side_effect = lambda keys, start, end: {}

    data = post_plan(APIClient()).json()
    route = data["routes"][0]
    assert all(cp["risk"] is None for cp in route["checkpoints"])
    assert route["summary"]["unknown_miles"] == 50.0
    assert route["summary"]["average_risk"] is None


@pytest.mark.django_db
def test_latlon_input_skips_geocoding(providers):
    providers["routes"].return_value = [straight_route(10, seconds_per_mile=60)]
    providers["weather"].side_effect = lambda keys, start, end: {key: forecast(start, 60) for key in keys}

    data = post_plan(APIClient(), origin="40.0,-100.0", destination="40.0, -98.0").json()
    assert providers["geocode"].call_count == 0
    assert data["query"]["origin"]["lat"] == 40.0


@pytest.mark.django_db
def test_picked_suggestion_coordinates_skip_geocoding_and_keep_the_label(providers):
    providers["routes"].return_value = [straight_route(10, seconds_per_mile=60)]
    providers["weather"].side_effect = lambda keys, start, end: {key: forecast(start, 60) for key in keys}

    data = post_plan(
        APIClient(),
        origin="Denver, Colorado, United States",
        origin_coords=[39.7392, -104.9903],
        destination="Salt Lake City, Utah, United States",
        destination_coords=[40.7608, -111.891],
    ).json()
    assert providers["geocode"].call_count == 0
    assert data["query"]["origin"] == {"name": "Denver, Colorado, United States", "lat": 39.7392, "lon": -104.9903}


@pytest.mark.django_db
def test_out_of_range_coordinates_are_rejected(providers):
    response = post_plan(APIClient(), origin_coords=[95.0, 10.0])
    assert response.status_code == 400
    assert "origin_coords" in response.json()["error"]["detail"]


@pytest.mark.django_db
def test_upstream_failure_returns_503_with_error_shape(providers):
    providers["routes"].side_effect = UpstreamServiceError("Routing service is unavailable.")
    response = post_plan(APIClient())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_unavailable"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"load_weight_lb": 0}, "load_weight_lb"),
        ({"load_weight_lb": -5}, "load_weight_lb"),
        ({"checkpoint_interval_miles": 30}, "checkpoint_interval_miles"),
        ({"departure_time": (DEPARTURE - timedelta(days=1)).isoformat()}, "departure_time"),
        ({"departure_time": (DEPARTURE + timedelta(days=30)).isoformat()}, "departure_time"),
        ({"destination": "A"}, "destination"),
        ({"origin": ""}, "origin"),
    ],
)
def test_invalid_input_is_rejected_before_any_provider_call(providers, overrides, field):
    response = post_plan(APIClient(), **overrides)
    assert response.status_code == 400
    assert field in response.json()["error"]["detail"]
    assert providers["routes"].call_count == 0
