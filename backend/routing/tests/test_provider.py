import pytest

from core.exceptions import UpstreamServiceError
from routing import provider

ORIGIN = (40.0, -100.0)
DESTINATION = (40.0, -98.0)


@pytest.fixture
def clients(mocker):
    return {
        "ors": mocker.patch.object(provider.ors, "get_routes", return_value=["ors-route"]),
        "osrm": mocker.patch.object(provider.osrm, "get_routes", return_value=["osrm-route"]),
    }


def test_auto_uses_ors_when_a_key_is_configured(settings, clients):
    settings.ROUTING_PROVIDER = "auto"
    settings.ORS_API_KEY = "k"
    settings.TRUCK_TARE_LB = 33_000

    assert provider.get_routes(ORIGIN, DESTINATION, load_weight_lb=42_000) == ["ors-route"]
    (_, _, tonnes), _ = clients["ors"].call_args
    assert tonnes == pytest.approx(75_000 / 2204.62)
    assert clients["osrm"].call_count == 0
    assert provider.routing_info(42_000) == {
        "provider": "openrouteservice",
        "profile": "driving-hgv",
        "gross_weight_lb": 75_000,
    }


def test_auto_uses_osrm_without_a_key(settings, clients):
    settings.ROUTING_PROVIDER = "auto"
    settings.ORS_API_KEY = ""
    assert provider.get_routes(ORIGIN, DESTINATION, 42_000) == ["osrm-route"]
    assert clients["ors"].call_count == 0
    assert provider.routing_info(42_000)["profile"] == "car"


def test_falls_back_to_osrm_when_ors_is_unavailable(settings, clients):
    settings.ROUTING_PROVIDER = "ors"
    settings.ORS_API_KEY = "k"
    settings.ROUTING_FALLBACK_TO_OSRM = True
    clients["ors"].side_effect = UpstreamServiceError()
    assert provider.get_routes(ORIGIN, DESTINATION, 42_000) == ["osrm-route"]


def test_fallback_can_be_disabled(settings, clients):
    settings.ROUTING_PROVIDER = "ors"
    settings.ORS_API_KEY = "k"
    settings.ROUTING_FALLBACK_TO_OSRM = False
    clients["ors"].side_effect = UpstreamServiceError()
    with pytest.raises(UpstreamServiceError):
        provider.get_routes(ORIGIN, DESTINATION, 42_000)
