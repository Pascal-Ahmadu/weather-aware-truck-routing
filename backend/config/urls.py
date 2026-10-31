from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/health/", health),
    path("api/trips/", include("trips.urls")),
    path("api/geocode/", include("geocoding.urls")),
]
