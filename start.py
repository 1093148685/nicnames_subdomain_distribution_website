#!/usr/bin/env python3
"""Start DNS Portal for local development."""
from app.web import app
import uvicorn

uvicorn.run(app, host="0.0.0.0", port=8096, log_level="info")
