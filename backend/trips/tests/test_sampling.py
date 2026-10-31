from core.geo import METERS_PER_MILE
from routing.alternatives import Route
from trips.services import sample_checkpoints


def straight_route(total_miles: float, vertices: int, seconds_per_mile: float = 60.0) -> Route:
    """Due-east line with evenly spaced vertices and a uniform speed."""
    miles_per_segment = total_miles / (vertices - 1)
    coords = [(40.0, -100.0 + i * miles_per_segment / 53.0) for i in range(vertices)]  # ~53 mi per degree lon at 40N
    seg_meters = [miles_per_segment * METERS_PER_MILE] * (vertices - 1)
    seg_seconds = [miles_per_segment * seconds_per_mile] * (vertices - 1)
    return Route(coords, seg_meters, seg_seconds, total_miles * METERS_PER_MILE, total_miles * seconds_per_mile)


def test_checkpoints_at_origin_each_interval_and_destination():
    cps = sample_checkpoints(straight_route(100, 11), interval_miles=25)
    assert [cp.mile for cp in cps] == [0, 25, 50, 75, 100]
    assert cps[0].index == 0 and cps[-1].index == 4


def test_eta_follows_router_segment_durations_not_flat_average():
    route = straight_route(100, 11)
    # Make the second half of the road twice as slow.
    slow = list(route.segment_seconds)
    for i in range(5, 10):
        slow[i] *= 2
    route = Route(route.coordinates, route.segment_meters, slow, route.distance_meters, sum(slow))

    cps = sample_checkpoints(route, interval_miles=50)
    assert cps[1].seconds_from_departure == 50 * 60  # first half at normal speed
    assert cps[2].seconds_from_departure == 50 * 60 + 50 * 120  # second half doubled


def test_positions_are_interpolated_between_vertices():
    cps = sample_checkpoints(straight_route(100, 3), interval_miles=25)  # vertices at 0, 50, 100 mi
    mile_25 = cps[1]
    assert mile_25.lat == 40.0
    assert abs(mile_25.lon - (-100.0 + 25 / 53.0)) < 1e-9


def test_geometry_index_points_at_vertex_before_each_checkpoint():
    cps = sample_checkpoints(straight_route(100, 3), interval_miles=25)  # vertices 0, 1, 2 at 0, 50, 100 mi
    assert [cp.geometry_index for cp in cps] == [0, 0, 1, 1, 2]


def test_segment_miles_cover_route_and_last_is_zero():
    cps = sample_checkpoints(straight_route(100, 11), interval_miles=25)
    assert [cp.segment_miles for cp in cps] == [25, 25, 25, 25, 0]
    assert sum(cp.segment_miles for cp in cps) == 100


def test_regular_mark_near_destination_is_dropped():
    cps = sample_checkpoints(straight_route(52, 53), interval_miles=25)  # 50 is within 6.25 mi of 52
    assert [cp.mile for cp in cps] == [0, 25, 52]


def test_short_route_has_origin_and_destination_only():
    cps = sample_checkpoints(straight_route(8, 9), interval_miles=10)
    assert [cp.mile for cp in cps] == [0, 8]


def test_falls_back_to_haversine_and_proportional_time_without_annotations():
    route = straight_route(100, 11)
    bare = Route(route.coordinates, [], [], route.distance_meters, 6000.0)
    cps = sample_checkpoints(bare, interval_miles=50)
    assert [cp.mile for cp in cps][0] == 0
    assert abs(cps[-1].mile - 100) < 1  # haversine along the lat-40 line matches the nominal spacing
    assert abs(cps[-1].seconds_from_departure - 6000.0) < 1e-6
