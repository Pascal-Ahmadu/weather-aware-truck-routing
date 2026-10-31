from recommendation.engine import ClassifiedSegment, RouteRiskSummary, rank_routes, summarize_route
from risk.types import RiskLevel

L, M, H, S, N = RiskLevel.LOW, RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.SEVERE, RiskLevel.NO_TRAVEL


def summary(route_id, *, duration=3600, no_travel=0, severe=0, high=0, avg=0.0):
    return RouteRiskSummary(
        route_id=route_id,
        duration_seconds=duration,
        no_travel_miles=no_travel,
        severe_miles=severe,
        high_miles=high,
        moderate_miles=0,
        low_miles=0,
        unknown_miles=0,
        average_risk=avg,
    )


def test_summarize_buckets_miles_by_level_and_weights_average():
    segments = [
        ClassifiedSegment(L, 10),
        ClassifiedSegment(H, 20),
        ClassifiedSegment(S, 5),
        ClassifiedSegment(N, 1),
        ClassifiedSegment(None, 4),
        ClassifiedSegment(S, 0),  # destination checkpoint covers no miles
    ]
    result = summarize_route("r", 100, segments)
    assert result.low_miles == 10
    assert result.high_miles == 20
    assert result.severe_miles == 5
    assert result.no_travel_miles == 1
    assert result.unknown_miles == 4
    # (0*10 + 2*20 + 3*5 + 4*1) / 36
    assert result.average_risk == (40 + 15 + 4) / 36


def test_summarize_with_no_known_weather_has_no_average():
    result = summarize_route("r", 100, [ClassifiedSegment(None, 50)])
    assert result.average_risk is None
    assert result.unknown_miles == 50


def test_no_travel_miles_rank_before_everything():
    fast_but_blocked = summary("blocked", duration=100, no_travel=1)
    slow_and_severe = summary("severe", duration=10_000, severe=200, high=200, avg=3.0)
    assert [r.route_id for r in rank_routes([fast_but_blocked, slow_and_severe])] == ["severe", "blocked"]


def test_fewest_severe_miles_wins_over_high_miles():
    a = summary("a", severe=10, high=0)
    b = summary("b", severe=5, high=100, avg=2.0)
    assert rank_routes([a, b])[0].route_id == "b"


def test_fewest_high_miles_breaks_severe_tie():
    a = summary("a", severe=5, high=30)
    b = summary("b", severe=5, high=10, avg=1.9)
    assert rank_routes([a, b])[0].route_id == "b"


def test_lowest_average_risk_breaks_high_tie():
    a = summary("a", severe=5, high=10, avg=1.2)
    b = summary("b", severe=5, high=10, avg=0.8, duration=99_999)
    assert rank_routes([a, b])[0].route_id == "b"


def test_shortest_duration_breaks_full_tie():
    a = summary("a", duration=5000, avg=1.0)
    b = summary("b", duration=4000, avg=1.0)
    assert rank_routes([a, b])[0].route_id == "b"


def test_unknown_average_sorts_after_known():
    unknown = RouteRiskSummary("u", 10, 0, 0, 0, 0, 0, 100, average_risk=None)
    known = summary("k", duration=10_000, avg=2.9)
    assert rank_routes([unknown, known])[0].route_id == "k"


def test_ranking_is_stable_for_identical_routes():
    a, b = summary("a"), summary("b")
    assert [r.route_id for r in rank_routes([a, b])] == ["a", "b"]
