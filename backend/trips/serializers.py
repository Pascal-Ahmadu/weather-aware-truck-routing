from datetime import UTC, timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

CHECKPOINT_INTERVALS = (10, 25, 50)


class CoordinatesField(serializers.ListField):
    """[lat, lon] from a picked suggestion; lets the backend skip re-geocoding the label."""

    child = serializers.FloatField()

    def __init__(self, **kwargs):
        super().__init__(min_length=2, max_length=2, required=False, allow_null=True, **kwargs)

    def to_internal_value(self, data):
        lat, lon = super().to_internal_value(data)
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise serializers.ValidationError("Coordinates out of range.")
        return (lat, lon)


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200, trim_whitespace=True)
    destination = serializers.CharField(max_length=200, trim_whitespace=True)
    origin_coords = CoordinatesField()
    destination_coords = CoordinatesField()
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=1, max_value=200_000)
    checkpoint_interval_miles = serializers.ChoiceField(choices=CHECKPOINT_INTERVALS, default=25)

    def validate_departure_time(self, value):
        now = timezone.now()
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Departure time must not be in the past.")
        if value > now + timedelta(days=settings.MAX_DEPARTURE_DAYS_AHEAD):
            raise serializers.ValidationError(
                f"Departure time must be within the next {settings.MAX_DEPARTURE_DAYS_AHEAD} days (forecast horizon)."
            )
        return value.astimezone(UTC)

    def validate(self, attrs):
        attrs.setdefault("origin_coords", None)
        attrs.setdefault("destination_coords", None)
        same_text = attrs["origin"].strip().lower() == attrs["destination"].strip().lower()
        same_coords = attrs["origin_coords"] is not None and attrs["origin_coords"] == attrs["destination_coords"]
        if same_text or same_coords:
            raise serializers.ValidationError({"destination": "Destination must differ from origin."})
        return attrs
