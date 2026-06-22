"""Database models"""
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, JSON, Float, ForeignKey, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(32), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(16), default="user")  # user, admin
    credits = Column(Integer, default=10)
    is_active = Column(Boolean, default=True)
    whois_privacy = Column(Boolean, default=True)
    group_id = Column(Integer, nullable=True)
    referral_code = Column(String(32), unique=True, nullable=True)
    invited_by = Column(Integer, nullable=True)
    banned_at = Column(DateTime, nullable=True)
    banned_reason = Column(String(500), nullable=True)
    github_id = Column(String(255), nullable=True)
    oidc_provider = Column(String(32), nullable=True)
    oidc_id = Column(String(255), nullable=True)
    oidc_avatar = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subdomains = relationship("Subdomain", back_populates="owner")
    transactions = relationship("Transaction", back_populates="user")

class Subdomain(Base):
    __tablename__ = "subdomains"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    domain_id = Column(Integer, nullable=False)
    prefix = Column(String(64), nullable=False)
    fqdn = Column(String(255), unique=True, nullable=False)
    root_domain = Column(String(255), nullable=False)
    records_count = Column(Integer, default=0)
    status = Column(String(16), default="active")  # active, pending_delete, violation
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="subdomains")
    records = relationship("DNSRecord", back_populates="subdomain")

class DNSRecord(Base):
    __tablename__ = "dns_records"
    id = Column(Integer, primary_key=True)
    subdomain_id = Column(Integer, ForeignKey("subdomains.id"), nullable=False)
    type = Column(String(10), nullable=False)  # A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
    name = Column(String(255), nullable=False)
    content = Column(String(500), nullable=False)
    ttl = Column(Integer, default=3600)
    priority = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subdomain = relationship("Subdomain", back_populates="records")

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(32), nullable=False)
    amount = Column(Integer, nullable=False)
    balance = Column(Integer, nullable=False)
    description = Column(String(500), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="transactions")

class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(64), nullable=False)
    key = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime, nullable=True)

class InviteRecord(Base):
    __tablename__ = "invite_records"
    id = Column(Integer, primary_key=True)
    inviter_id = Column(Integer, nullable=False)
    friend_id = Column(Integer, nullable=False)
    friend_username = Column(String(32), nullable=False)
    verified = Column(Boolean, default=False)
    reward = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# --- Admin tables ---

class UserGroup(Base):
    __tablename__ = "user_groups"
    id = Column(Integer, primary_key=True)
    name = Column(String(64), unique=True, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class GroupAccess(Base):
    __tablename__ = "group_access"
    id = Column(Integer, primary_key=True)
    domain_id = Column(Integer, nullable=False)
    group_id = Column(Integer, nullable=False)
    cost = Column(Integer, default=10)
    max_dns_records = Column(Integer, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, nullable=False)
    action = Column(String(64), nullable=False)
    resource_type = Column(String(32), nullable=False)
    resource_id = Column(Integer, nullable=True)
    details = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class SystemConfig(Base):
    __tablename__ = "system_config"
    id = Column(Integer, primary_key=True)
    key = Column(String(64), unique=True, nullable=False)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ReservedPrefix(Base):
    __tablename__ = "reserved_prefixes"
    id = Column(Integer, primary_key=True)
    prefix = Column(String(64), unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class PremiumPrefix(Base):
    __tablename__ = "premium_prefixes"
    id = Column(Integer, primary_key=True)
    prefix = Column(String(64), unique=True, nullable=False)
    price_multiplier = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Moderation(Base):
    __tablename__ = "moderation"
    id = Column(Integer, primary_key=True)
    type = Column(String(16), nullable=False)  # abuse, showcase
    subdomain_id = Column(Integer, nullable=True)
    reporter_id = Column(Integer, nullable=True)
    reason = Column(Text, default="")
    site_name = Column(String(128), nullable=True)
    site_url = Column(String(500), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    owner_name = Column(String(128), nullable=True)
    status = Column(String(16), default="pending")  # pending, approved, rejected
    reviewed_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    title = Column(String(128), nullable=False)
    content = Column(Text, default="")
    type = Column(String(16), default="info")
    target = Column(String(16), default="all")  # all, users, groups
    target_ids = Column(Text, default="")
    read_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class IpFingerprint(Base):
    """访问者 IP 指纹记录 — 记录每次重要操作的 IP、UA、地理位置和浏览器指纹"""
    __tablename__ = "ip_fingerprints"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True)  # 未登录用户可为 null
    ip = Column(String(64), nullable=False)
    user_agent = Column(String(500), default="")
    accept_language = Column(String(200), default="")
    screen_resolution = Column(String(50), default="")  # 客户端 JS 采集 1920x1080
    timezone = Column(String(64), default="")
    platform = Column(String(64), default="")  # Win32, Linux x86_64
    canvas_hash = Column(String(64), default="")  # Canvas fingerprint hash
    fonts = Column(Text, default="")  # JSON array of detected fonts
    browser_id = Column(String(128), default="")  # 持久化浏览器 ID (localStorage)
    geo_country = Column(String(64), default="")
    geo_asn = Column(String(64), default="")
    action = Column(String(32), default="visit")  # visit, signup, login, api
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class OIDCState(Base):
    """Temporary OIDC state parameter storage for login flow."""
    __tablename__ = "oidc_states"
    id = Column(Integer, primary_key=True)
    state = Column(String(64), unique=True, nullable=False, index=True)
    provider = Column(String(32), nullable=False)
    redirect_to = Column(String(500), default="")
    intent = Column(String(32), default="login")  # "login" or "bind"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

def _ensure_sqlite_columns(engine):
    """Lightweight SQLite migrations for columns added after initial create_all."""
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(moderation)"))}
        if "avatar_url" not in existing:
            conn.execute(text("ALTER TABLE moderation ADD COLUMN avatar_url VARCHAR(500)"))
        if "owner_name" not in existing:
            conn.execute(text("ALTER TABLE moderation ADD COLUMN owner_name VARCHAR(128)"))
    with engine.begin() as conn:
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        if "oidc_provider" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN oidc_provider VARCHAR(32)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN oidc_id VARCHAR(255)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN oidc_avatar VARCHAR(500)"))
    # 兼容旧表创建 ip_fingerprints（新数据库由 create_all 自动创建）
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(ip_fingerprints)"))}
        if "id" not in existing:
            # 表不存在，create_all 会在首次启动时自动创建
            pass


def init_db():
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "dnsportal.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    _ensure_sqlite_columns(engine)
    return engine

engine = init_db()
SessionLocal = sessionmaker(bind=engine)
