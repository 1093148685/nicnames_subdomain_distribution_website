"""Import NicNames domains into local DNS Portal data.

This helper intentionally does not contain hard-coded credentials. Configure
NicNames credentials through the application settings before use.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.dns_manager import NicNamesDNS, load_credentials
from app.models import SessionLocal


def main() -> None:
    with SessionLocal() as db:
        creds = load_credentials(db)
    if not creds:
        raise SystemExit("NicNames credentials are not configured")

    manager = NicNamesDNS(creds["email"], creds["password"])
    domains = manager.get_domains()
    for domain in domains:
        print(domain.get("name") or domain)


if __name__ == "__main__":
    main()
