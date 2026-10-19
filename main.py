"""Vercel entrypoint: the hosted paybybot web interface (see paybybot3/web.py)."""

import os

os.environ.setdefault("PAYBYBOT_HOSTED", "1")

from paybybot3.web import app  # noqa: E402,F401
