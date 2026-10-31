import pytest

from risk.engine import classify_checkpoint, classify_rain, classify_snow, classify_wind
from risk.types import RiskLevel

L, M, H, S, N = RiskLevel.LOW, RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.SEVERE, RiskLevel.NO_TRAVEL


@pytest.mark.parametrize(
    "wind_mph, expected",
    [
        (0, L),
        (24.9, L),
        (25, M),
        (30, M),
        (34.9, M),
        (35, H),
        (40, H),
        (44.9, H),
        (45, S),
        (50, S),
        (54.9, S),
        (55, N),
        (80, N),
    ],
)
def test_wind_boundaries(wind_mph, expected):
    assert classify_wind(wind_mph) == expected


@pytest.mark.parametrize(
    "rain_in_hr, expected",
    [
        (0, L),
        (0.099, L),
        (0.10, M),
        (0.2, M),
        (0.249, M),
        (0.25, H),
        (0.4, H),
        (0.499, H),
        (0.50, S),
        (0.75, S),
        (1.00, S),
        (1.001, N),
        (2.0, N),
    ],
)
def test_rain_boundaries(rain_in_hr, expected):
    assert classify_rain(rain_in_hr) == expected


@pytest.mark.parametrize(
    "snow_in_hr, expected",
    [
        (0, L),
        (0.49, L),
        (0.5, M),
        (0.8, M),
        (0.99, M),
        (1.0, H),
        (1.5, H),
        (1.99, H),
        (2.0, S),
        (2.5, S),
        (3.0, S),
        (3.01, N),
        (5.0, N),
    ],
)
def test_snow_boundaries(snow_in_hr, expected):
    assert classify_snow(snow_in_hr) == expected


def test_checkpoint_takes_worst_condition():
    assert classify_checkpoint(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0, load_weight_lb=10_000) == H
    assert classify_checkpoint(wind_mph=10, rain_in_hr=0, snow_in_hr=2.5, load_weight_lb=10_000) == S
    assert classify_checkpoint(wind_mph=50, rain_in_hr=0, snow_in_hr=0, load_weight_lb=10_000) == S


def test_calm_weather_is_low_regardless_of_load():
    assert classify_checkpoint(0, 0, 0, load_weight_lb=80_000) == L


@pytest.mark.parametrize("wind_mph", [55, 60, 100])
@pytest.mark.parametrize("load_weight_lb", [0, 1_000, 30_000, 80_000])
def test_wind_55_plus_is_no_travel_for_any_load(wind_mph, load_weight_lb):
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb) == N


@pytest.mark.parametrize("wind_mph", [45, 50, 54.9])
def test_wind_45_54_with_load_over_30k_is_no_travel(wind_mph):
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=30_001) == N
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=30_000) == S
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=10_000) == S


@pytest.mark.parametrize("wind_mph", [35, 40, 44.9])
def test_wind_35_44_with_load_over_40k_is_severe(wind_mph):
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=40_001) == S
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=40_000) == H
    assert classify_checkpoint(wind_mph, 0, 0, load_weight_lb=10_000) == H


def test_load_rules_never_downgrade():
    # Heavy snow already makes this No Travel; the 35-44 mph load rule must not lower it.
    assert classify_checkpoint(wind_mph=40, rain_in_hr=0, snow_in_hr=4.0, load_weight_lb=50_000) == N
    # 45-54 mph with a light load stays Severe even if the load rule is not triggered.
    assert classify_checkpoint(wind_mph=50, rain_in_hr=0, snow_in_hr=0, load_weight_lb=1_000) == S


def test_load_rule_boundary_at_45_mph_uses_no_travel_rule_not_severe_rule():
    assert classify_checkpoint(wind_mph=45, rain_in_hr=0, snow_in_hr=0, load_weight_lb=35_000) == N
    assert classify_checkpoint(wind_mph=44.9, rain_in_hr=0, snow_in_hr=0, load_weight_lb=35_000) == H


def test_risk_level_labels():
    assert N.label == "No Travel"
    assert L.label == "Low"
    assert max(L, N) == N
