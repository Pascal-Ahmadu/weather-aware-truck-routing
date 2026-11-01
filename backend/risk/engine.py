"""Pure risk classification. No I/O — every function here is a table lookup.

Boundary convention (see README, "Decisions"): a value that sits
exactly on a shared boundary belongs to the more severe bucket (25 mph is
Moderate, 0.25 in/hr rain is High). The one exception is written explicitly in
the spec: rain/snow "No Travel" is strictly greater than the Severe ceiling, so
1.00 in/hr rain and 3.0 in/hr snow are still Severe.
"""

from .types import RiskLevel

WIND_BREAKPOINTS_MPH = (25.0, 35.0, 45.0, 55.0)
RAIN_BREAKPOINTS_IN_HR = (0.10, 0.25, 0.50, 1.00)
SNOW_BREAKPOINTS_IN_HR = (0.5, 1.0, 2.0, 3.0)

NO_TRAVEL_WIND_MPH = 55.0
HEAVY_LOAD_NO_TRAVEL_LB = 30_000
HEAVY_LOAD_SEVERE_LB = 40_000


def _classify(
    value: float, breakpoints: tuple[float, float, float, float], *, severe_ceiling_inclusive: bool
) -> RiskLevel:
    to_moderate, to_high, to_severe, to_no_travel = breakpoints
    if value < to_moderate:
        return RiskLevel.LOW
    if value < to_high:
        return RiskLevel.MODERATE
    if value < to_severe:
        return RiskLevel.HIGH
    if severe_ceiling_inclusive:
        return RiskLevel.SEVERE if value <= to_no_travel else RiskLevel.NO_TRAVEL
    return RiskLevel.SEVERE if value < to_no_travel else RiskLevel.NO_TRAVEL


def classify_wind(wind_mph: float) -> RiskLevel:
    return _classify(wind_mph, WIND_BREAKPOINTS_MPH, severe_ceiling_inclusive=False)


def classify_rain(rain_in_hr: float) -> RiskLevel:
    return _classify(rain_in_hr, RAIN_BREAKPOINTS_IN_HR, severe_ceiling_inclusive=True)


def classify_snow(snow_in_hr: float) -> RiskLevel:
    return _classify(snow_in_hr, SNOW_BREAKPOINTS_IN_HR, severe_ceiling_inclusive=True)


def classify_checkpoint(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_weight_lb: float) -> RiskLevel:
    """Worst of the three conditions, then load rules applied as escalations only."""
    level = max(classify_wind(wind_mph), classify_rain(rain_in_hr), classify_snow(snow_in_hr))

    # Wind >= 55 mph is already NO_TRAVEL from classify_wind for any load.
    if 45.0 <= wind_mph < NO_TRAVEL_WIND_MPH and load_weight_lb > HEAVY_LOAD_NO_TRAVEL_LB:
        return RiskLevel.NO_TRAVEL
    if 35.0 <= wind_mph < 45.0 and load_weight_lb > HEAVY_LOAD_SEVERE_LB:
        return max(level, RiskLevel.SEVERE)
    return level
