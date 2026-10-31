from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .serializers import PlanRequestSerializer
from .services import PlanRequest, plan_trip


class PlanThrottle(AnonRateThrottle):
    scope = "plan"


class PlanTripView(APIView):
    throttle_classes = [PlanThrottle]

    def post(self, request):
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = plan_trip(PlanRequest(**serializer.validated_data))
        return Response(result)
