from datetime import UTC, timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

CHECKPOINT_INTERVALS = (10, 25, 50)


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200, trim_whitespace=True)
    destination = serializers.CharField(max_length=200, trim_whitespace=True)
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
        if attrs["origin"].strip().lower() == attrs["destination"].strip().lower():
            raise serializers.ValidationError({"destination": "Destination must differ from origin."})
        return attrs
