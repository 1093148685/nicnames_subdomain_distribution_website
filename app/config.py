"""DNS Portal Configuration"""
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    app_name: str = "DNS Portal"
    debug: bool = True
    port: int = 8096
    host: str = "0.0.0.0"
    
    # Database
    database_url: str = "sqlite:///data/dnsportal.db"
    
    # Auth
    secret_key: str = "CHANGE_ME-dns-portal-secret-key"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours
    
    # NicNames
    nicnames_email: str = "REDACTED@example.com"
    nicnames_password: str = "***"
    
    # DNS domains we manage
    managed_domains: list = []
    
    # OIDC
    oidc_base_url: str = "https://REDACTED.example.com"
    github_client_id: str = ""
    github_client_secret: str = ""
    linuxdo_client_id: str = ""
    linuxdo_client_secret: str = ""
    linuxdo_oidc_url: str = "https://connect.linux.do"
    
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

settings = Settings()
