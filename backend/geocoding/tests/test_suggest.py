import pytest
import responses
from django.core.cache import cache
from rest_framework.test import APIClient

PHOTON = "https://photon.komoot.io/api/"


def feature(name, city=None, state=None, country="United States", lon=-104.99, lat=39.74, countrycode="US"):
    props = {"name": name, "country": country, "countrycode": countrycode}
    if city:
        props["city"] = city
    if state:
        props["state"] = state
    return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@responses.activate
def test_suggest_returns_labelled_coordinates():
    responses.get(
        PHOTON,
        json={"features": [feature("Denver", state="Colorado"), feature("Denver", city="Denver", state="Colorado")]},
    )
    response = APIClient().get("/api/geocode/suggest/", {"q": "denv"})
    assert response.status_code == 200
    assert response.json() == {
        "results": [{"name": "Denver, Colorado, United States", "lat": 39.74, "lon": -104.99}]
    }  # duplicate label collapsed


@responses.activate
def test_us_results_are_listed_first_keeping_photon_order_otherwise():
    responses.get(
        PHOTON,
        json={
            "features": [
                feature("Chey", state="Duhok", country="Iraq", countrycode="IQ", lon=44.04, lat=37.26),
                feature("Chey", state="Nouvelle-Aquitaine", country="France", countrycode="FR", lon=-0.05, lat=46.3),
                feature("Cheyenne", state="Wyoming", lon=-104.82, lat=41.14),
                feature("Cheyenne", state="Colorado", lon=-104.0, lat=38.8),
            ]
        },
    )
    names = [r["name"] for r in APIClient().get("/api/geocode/suggest/", {"q": "chey"}).json()["results"]]
    assert names == [
        "Cheyenne, Wyoming, United States",
        "Cheyenne, Colorado, United States",
        "Chey, Duhok, Iraq",
        "Chey, Nouvelle-Aquitaine, France",
    ]


@responses.activate
def test_suggest_is_cached_per_query():
    responses.get(PHOTON, json={"features": [feature("Denver", state="Colorado")]})
    client = APIClient()
    client.get("/api/geocode/suggest/", {"q": "Denver"})
    client.get("/api/geocode/suggest/", {"q": "denver"})
    assert len(responses.calls) == 1


def test_suggest_requires_two_characters():
    response = APIClient().get("/api/geocode/suggest/", {"q": "d"})
    assert response.status_code == 400
    assert "q" in response.json()["error"]["detail"]


@responses.activate
def test_suggest_upstream_failure_is_503():
    responses.get(PHOTON, status=502)
    response = APIClient().get("/api/geocode/suggest/", {"q": "denver"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_unavailable"
