import pytest
import responses

from core.exceptions import NoRouteFound, UpstreamServiceError
from routing import ors_client

ORS = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"
ORIGIN = (40.0, -100.0)
DESTINATION = (40.0, -98.0)


def feature(lats, duration_per_step=100.0, lon_start=-100.0):
    """A straight east-west line with evenly spaced vertices, split into two steps."""
    n = len(lats)
    coords = [[lon_start + 2.0 * i / (n - 1), lat] for i, lat in enumerate(lats)]
    mid = n // 2
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": {
            "summary": {"distance": 170_000.0, "duration": 2 * duration_per_step},
            "segments": [
                {
                    "steps": [
                        {"distance": 85_000.0, "duration": duration_per_step, "way_points": [0, mid]},
                        {"distance": 85_000.0, "duration": duration_per_step, "way_points": [mid, n - 1]},
                        {"distance": 0.0, "duration": 0.0, "way_points": [n - 1, n - 1]},  # arrival step
                    ]
                }
            ],
        },
    }


@pytest.fixture(autouse=True)
def ors_settings(settings):
    settings.ORS_API_KEY = "test-key"
    settings.ORS_BASE_URL = "https://api.openrouteservice.org"
    settings.MAX_ROUTE_ALTERNATIVES = 3


@responses.activate
def test_parses_geometry_and_spreads_step_durations_over_vertices():
    responses.post(ORS, json={"type": "FeatureCollection", "features": [feature([40.0] * 11)]})
    mocker_calls = []
    # Only the primary request should be answered; detours get a 404 -> skipped.
    responses.post(ORS, json={"error": {"code": 2010, "message": "no routable point"}}, status=404)

    routes = ors_client.get_routes(ORIGIN, DESTINATION, gross_weight_tonnes=34.0)
    route = routes[0]
    assert route.coordinates[0] == (40.0, -100.0)
    assert len(route.segment_meters) == len(route.coordinates) - 1 == 10
    assert len(route.segment_seconds) == 10
    assert sum(route.segment_seconds) == pytest.approx(200.0)
    # Evenly spaced vertices -> each of the 5 segments in a step gets a fifth of its duration.
    assert route.segment_seconds[0] == pytest.approx(20.0)
    assert route.duration_seconds == 200.0
    assert not mocker_calls


@responses.activate
def test_sends_gross_weight_restriction_and_api_key():
    responses.post(ORS, json={"type": "FeatureCollection", "features": [feature([40.0] * 5)]})
    responses.post(ORS, json={"error": {"code": 2010, "message": "x"}}, status=404)

    ors_client.get_routes(ORIGIN, DESTINATION, gross_weight_tonnes=34.019)

    first = responses.calls[0].request
    assert first.headers["Authorization"] == "test-key"
    body = first.body.decode() if isinstance(first.body, bytes) else first.body
    assert '"weight": 34.02' in body
    assert '"coordinates": [[-100.0, 40.0], [-98.0, 40.0]]' in body


@responses.activate
def test_no_route_codes_raise_no_route_found():
    responses.post(ORS, json={"error": {"code": 2009, "message": "Route could not be found"}}, status=404)
    with pytest.raises(NoRouteFound):
        ors_client.get_routes(ORIGIN, DESTINATION, 34.0)


@responses.activate
def test_other_errors_are_upstream_failures():
    responses.post(ORS, json={"error": {"code": 2003, "message": "Invalid key"}}, status=403)
    with pytest.raises(UpstreamServiceError):
        ors_client.get_routes(ORIGIN, DESTINATION, 34.0)
