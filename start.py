#!/usr/bin/env python3
"""Start DNS Portal"""
import sys
sys.path.insert(0, '/opt/data/apps/dnsportal')
from app.web import app
import uvicorn
import logging
logging.basicConfig(level=logging.DEBUG)
uvicorn.run(app, host='0.0.0.0', port=8096, log_level='debug')
