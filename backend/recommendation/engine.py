"""Pure route ranking. Takes already-classified checkpoints, returns an ordering.

Ranking (see README, "Decisions"): No Travel miles are a hard
constraint and sort first; then the spec's four criteria in order — fewest
Severe miles, fewest High miles, lowest distance-weighted average risk,
shortest travel time.

Each checkpoint's risk is applied to the segment from that checkpoint to the
next one, so "Severe miles" means miles driven *after* a Severe reading until
the next sample. Checkpoints with no weather data contribute to
`unknown_miles` and are excluded from the average.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from math import inf

from risk.types import RiskLevel


@dataclass(frozen=True)
class ClassifiedSegment:
    risk: RiskLevel | None
    miles: float


@dataclass(frozen=True)
class RouteRiskSummary:
    route_id: str
    duration_seconds: float
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    moderate_miles: float
    low_miles: float
    unknown_miles: float
    average_risk: float | None

    @property
    def sort_key(self) -> tuple[float, float, float, float, float]:
        return (
            self.no_travel_miles,
            self.severe_miles,
            self.high_miles,
            self.average_risk if self.average_risk is not None else inf,
            self.duration_seconds,
        )


def summarize_route(route_id: str, duration_seconds: float, segments: Sequence[ClassifiedSegment]) -> RouteRiskSummary:
    miles_by_level = {level: 0.0 for level in RiskLevel}
    unknown_miles = 0.0
    weighted_score = 0.0
    known_miles = 0.0

    for segment in segments:
        if segment.risk is None:
            unknown_miles += segment.miles
            continue
        miles_by_level[segment.risk] += segment.miles
        weighted_score += segment.risk * segment.miles
        known_miles += segment.miles

    return RouteRiskSummary(
        route_id=route_id,
        duration_seconds=duration_seconds,
        no_travel_miles=miles_by_level[RiskLevel.NO_TRAVEL],
        severe_miles=miles_by_level[RiskLevel.SEVERE],
        high_miles=miles_by_level[RiskLevel.HIGH],
        moderate_miles=miles_by_level[RiskLevel.MODERATE],
        low_miles=miles_by_level[RiskLevel.LOW],
        unknown_miles=unknown_miles,
        average_risk=(weighted_score / known_miles) if known_miles > 0 else None,
    )


def rank_routes(summaries: Sequence[RouteRiskSummary]) -> list[RouteRiskSummary]:
    """Best route first. Stable, so equal routes keep their input order."""
    return sorted(summaries, key=lambda s: s.sort_key)
