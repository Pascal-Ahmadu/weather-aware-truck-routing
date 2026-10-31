import pytest

from core.exceptions import NoRouteFound, UpstreamServiceError
from core.geo import METERS_PER_MILE
from routing import client
from routing.client import Route, get_routes

ORIGIN = (40.0, -100.0)
DESTINATION = (40.0, -98.0)


def line(lat: float, duration: float = 3600.0, points: int = 50) -> Route:
    coords = [(lat, -100.0 + 2.0 * i / (points - 1)) for i in range(points)]
    return Route(coords, [], [], 100 * METERS_PER_MILE, duration)


def spur_route(duration: float = 3600.0) -> Route:
    """Primary corridor with a 15-cell out-and-back excursion to the north in the middle."""
    base = line(40.0).coordinates
    out = [(40.0 + 0.02 * k, -99.0) for k in range(1, 16)]
    coords = base[:25] + out + list(reversed(out)) + base[25:]
    return Route(coords, [], [], 130 * METERS_PER_MILE, duration)


def test_returns_osrm_alternatives_when_distinct(mocker):
    request = mocker.patch.object(client, "_request", return_value=[line(40.0), line(40.5), line(41.0)])
    routes = get_routes(ORIGIN, DESTINATION)
    assert routes == [line(40.0), line(40.5), line(41.0)]
    assert request.call_count == 1


def test_fills_in_with_detour_routes_when_osrm_returns_one(mocker):
    calls = []

    def fake_request(waypoints, *, alternatives):
        calls.append(waypoints)
        if len(waypoints) == 2:
            return [line(40.0)]
        via_lat = waypoints[1][0]
        return [line(round(via_lat, 1))]  # a different corridor per detour side

    mocker.patch.object(client, "_request", side_effect=fake_request)
    routes = get_routes(ORIGIN, DESTINATION)

    assert len(routes) == 3
    assert routes[0] == line(40.0)
    assert len({r.coordinates[0][0] for r in routes}) == 3
    assert all(len(w) == 3 for w in calls[1:])  # detours are origin -> via -> destination
    assert len(calls) == 3  # stops requesting once three routes are found


def test_candidates_that_duplicate_the_primary_are_dropped(mocker):
    mocker.patch.object(client, "_request", side_effect=lambda w, *, alternatives: [line(40.0)])
    assert get_routes(ORIGIN, DESTINATION) == [line(40.0)]


def test_candidates_much_slower_than_primary_are_dropped(mocker):
    def fake_request(waypoints, *, alternatives):
        return [line(40.0)] if len(waypoints) == 2 else [line(41.0, duration=3600 * 1.6)]

    mocker.patch.object(client, "_request", side_effect=fake_request)
    assert get_routes(ORIGIN, DESTINATION) == [line(40.0)]


def test_out_and_back_spurs_are_dropped(mocker):
    def fake_request(waypoints, *, alternatives):
        return [line(40.0)] if len(waypoints) == 2 else [spur_route()]

    mocker.patch.object(client, "_request", side_effect=fake_request)
    assert get_routes(ORIGIN, DESTINATION) == [line(40.0)]


def test_retrace_fraction_distinguishes_spurs_from_clean_routes():
    assert client._retrace_fraction(line(40.0)) == 0.0
    assert client._retrace_fraction(spur_route()) > client.MAX_RETRACE_EXCESS


def test_failed_detour_requests_are_skipped_not_fatal(mocker):
    def fake_request(waypoints, *, alternatives):
        if len(waypoints) == 2:
            return [line(40.0)]
        raise UpstreamServiceError()

    mocker.patch.object(client, "_request", side_effect=fake_request)
    assert get_routes(ORIGIN, DESTINATION) == [line(40.0)]


def test_no_primary_route_raises(mocker):
    mocker.patch.object(client, "_request", return_value=[])
    with pytest.raises(NoRouteFound):
        get_routes(ORIGIN, DESTINATION)


def test_detour_points_sit_either_side_of_the_trip():
    points = client._detour_points(line(40.0), ORIGIN, DESTINATION)
    assert len(points) == 2 * len(client.DETOUR_FRACTIONS)
    north = [p for p in points if p[0] > 40.0]
    south = [p for p in points if p[0] < 40.0]
    assert len(north) == len(south) == len(client.DETOUR_FRACTIONS)
    # 100 mi trip -> 12 mi offset -> ~0.17 degrees of latitude
    assert all(abs(abs(p[0] - 40.0) - 12 / 69) < 0.01 for p in points)


def test_parse_route_concatenates_annotations_across_legs():
    raw = {
        "distance": 3000.0,
        "duration": 120.0,
        "geometry": {"coordinates": [[-100.0, 40.0], [-99.99, 40.0], [-99.98, 40.0], [-99.97, 40.0]]},
        "legs": [
            {"annotation": {"distance": [1000.0, 1000.0], "duration": [40.0, 40.0]}},
            {"annotation": {"distance": [1000.0], "duration": [40.0]}},
        ],
    }
    route = client._parse_route(raw)
    assert route.coordinates[0] == (40.0, -100.0)
    assert route.segment_meters == [1000.0, 1000.0, 1000.0]
    assert route.segment_seconds == [40.0, 40.0, 40.0]
