import logging
import uuid

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class LocationNotFound(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "location_not_found"
    default_detail = "Could not find that location."


class NoRouteFound(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_code = "no_route_found"
    default_detail = "No drivable route was found between those locations."


class UpstreamServiceError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "upstream_unavailable"
    default_detail = "A routing or weather provider is temporarily unavailable. Please try again."


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        code = getattr(exc, "default_code", "error")
        response.data = {"error": {"code": code, "detail": response.data}}
        return response

    correlation_id = uuid.uuid4().hex[:12]
    logger.exception("Unhandled error %s", correlation_id)
    return Response(
        {"error": {"code": "internal_error", "detail": "Unexpected error.", "correlation_id": correlation_id}},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
