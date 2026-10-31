import os

os.environ.setdefault("SECRET_KEY", "test-only-secret")
os.environ.setdefault("DEBUG", "False")

from .settings import *  # noqa: E402, F403

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"plan": "1000/min", "suggest": "1000/min"}}  # noqa: F405
