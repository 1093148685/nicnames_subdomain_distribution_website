#!/bin/bash
cd /opt/data/apps/dnsportal
exec /opt/data/apps/tg-monitor/.venv/bin/python3 -m uvicorn app.web:app --host 0.0.0.0 --port 8096 --log-level info
