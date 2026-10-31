from django.core.cache import cache
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .client import suggest

SUGGEST_CACHE_SECONDS = 600


class SuggestThrottle(AnonRateThrottle):
    scope = "suggest"


class SuggestQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)


class SuggestView(APIView):
    throttle_classes = [SuggestThrottle]

    def get(self, request):
        params = SuggestQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        query = params.validated_data["q"]

        key = f"suggest:{query.lower()}"
        results = cache.get(key)
        if results is None:
            results = [{"name": s.name, "lat": s.lat, "lon": s.lon} for s in suggest(query)]
            cache.set(key, results, SUGGEST_CACHE_SECONDS)
        return Response({"results": results})
