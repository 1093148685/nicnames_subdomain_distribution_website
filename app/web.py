"""DNS Portal - FastAPI Backend with React SPA"""
import json
import secrets
import hashlib
import hmac
import time
import ipaddress
import logging
import smtplib
import os
import subprocess
import re
from collections import defaultdict, deque
from urllib.parse import unquote
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy import text, or_ as sa_or, cast, String as SAString
from jose import jwt, JWTError

from app.config import settings
from app.models import Base, User, Subdomain, DNSRecord, Transaction, ApiKey, InviteRecord
from app.models import AuditLog, SystemConfig, ReservedPrefix, PremiumPrefix
from app.models import UserGroup, GroupAccess, Moderation, Notification
from app.models import IpFingerprint, OIDCState
from app.models import SessionLocal
from app.geoip import query_ip
from app.dns_manager import (
    NicNamesDNS, save_credentials, load_credentials, _BrowserManager,
    HAS_PLAYWRIGHT, delete_dns_record_playwright,
    start_nicnames_background_services, stop_nicnames_background_services,
)

logger = logging.getLogger(__name__)

APP_ROOT = Path(__file__).parent.parent
DATA_DIR = APP_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
IP_BAN_FILE = DATA_DIR / "blocked_ips.json"
SCAN_BAN_SECONDS = 86400
SCAN_SCORE_WINDOW_SECONDS = 600
SCAN_SCORE_THRESHOLD = 3
SCAN_SCORE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
BLOCKED_IPS: dict[str, dict] = {}
SCAN_PATH_PATTERNS = [
    re.compile(pattern, re.I) for pattern in (
        # CMS/后台路径探测
        r"/(wp-admin|wp-login\\.php|wp-content|wp-includes|xmlrpc\\.php|wp-json)(?:/|$)",
        r"/(phpmyadmin|pma|myadmin|adminer|admin-console)(?:/|$)",
        r"/(\\.env|\\.git|\\.svn|\\.hg|composer\\.json|composer\\.lock|package-lock\\.json|\\.npmrc|\\.dockerenv)(?:$|[/?])",
        r"/(config\\.php|database\\.php|db\\.sql|backup\\.zip|backup\\.tar|dump\\.sql|\\.sql|\\.bak|\\.old|\\.swp)(?:$|[/?])",
        r"/(vendor/phpunit|boaform|cgi-bin|shell|webshell|server-status|server-info)(?:/|$)",
        r"/(actuator|solr|jenkins|hudson|debug|trace|swagger|api-docs|graphql)(?:/|$)",
        r"/\\.well-known/(security\\.txt\\.php|acme-challenge/\\.env|pki-validation/)",
        r"(?:select\\+|union\\+|/etc/passwd|\\.\\./\\.\\./|%2e%2e%2f|<script|__proto__|constructor\\b)",
        # 批量注册/遍历特征
        r"/(signup|register|invite|forgot|reset)(?:\\.php|[?#].*=\\d{3,})",
        r"/(api|v1|v2|v3)/(user|users|account|accounts)/\\d+",
        # 代理/VPN 常用探测路径
        r"/(proxy|socks|http-proxy|https-proxy|check-ip|what-is-my-ip|geoip?)(?:/|$)",
    )
]

# ── 登录失败锁定 ───────────────────────────────
LOGIN_FAIL_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
LOGIN_FAIL_LIMIT = 5        # 5 次失败
LOGIN_FAIL_WINDOW = 300     # 5 分钟内
LOGIN_BAN_SECONDS = 1800    # 封 30 分钟

def _is_login_locked(identifier: str) -> bool:
    now = time.time()
    bucket = LOGIN_FAIL_BUCKETS.get(identifier)
    if not bucket:
        return False
    while bucket and bucket[0] <= now - LOGIN_FAIL_WINDOW:
        bucket.popleft()
    if len(bucket) >= LOGIN_FAIL_LIMIT:
        return True
    return False

def _record_login_fail(identifier: str) -> None:
    now = time.time()
    bucket = LOGIN_FAIL_BUCKETS[identifier]
    while bucket and bucket[0] <= now - LOGIN_FAIL_WINDOW:
        bucket.popleft()
    bucket.append(now)

# ── 注册频率限制（按邮箱域名 + IP 子网） ─────
REGISTER_LIMIT_PER_DOMAIN = 3    # 同一邮箱域名最多 3 次注册
REGISTER_LIMIT_PER_SUBNET = 5    # 同一 /24 最多 5 次注册
REGISTER_LIMIT_WINDOW = 86400    # 24 小时内
REGISTER_DOMAIN_COUNTS: dict[str, deque[float]] = defaultdict(deque)
REGISTER_SUBNET_COUNTS: dict[str, deque[float]] = defaultdict(deque)

def _register_domain_key(email: str) -> str:
    parts = (email or "").strip().lower().split("@")
    return parts[-1] if len(parts) == 2 else "unknown"

def _register_subnet_key(ip: str) -> str:
    try:
        addr = ipaddress.ip_address(ip)
        if isinstance(addr, ipaddress.IPv4Address):
            return ".".join(ip.split(".")[:3]) + ".0/24"
        return ip
    except Exception:
        return ip

def _check_register_limit(email: str, ip: str) -> None:
    now = time.time()
    domain = _register_domain_key(email)
    subnet = _register_subnet_key(ip)

    # 清理过期记录
    dq = REGISTER_DOMAIN_COUNTS[domain]
    while dq and dq[0] <= now - REGISTER_LIMIT_WINDOW:
        dq.popleft()
    sq = REGISTER_SUBNET_COUNTS[subnet]
    while sq and sq[0] <= now - REGISTER_LIMIT_WINDOW:
        sq.popleft()

    if len(dq) >= REGISTER_LIMIT_PER_DOMAIN:
        raise HTTPException(429, detail=f"邮箱域名 {domain} 今日注册次数上限，请更换邮箱")
    if len(sq) >= REGISTER_LIMIT_PER_SUBNET:
        raise HTTPException(429, detail="该网络段今日注册次数上限，请稍后再试")

    dq.append(now)
    sq.append(now)

# ── Tor / 代理 IP 识别（轻量内置列表 + 反向 DNS） ──
TOR_EXIT_NODES: set[str] = set()  # 运行时通过 DNS 刷新
TOR_EXIT_LAST_REFRESH: float = 0

def _refresh_tor_exit_nodes() -> None:
    global TOR_EXIT_NODES, TOR_EXIT_LAST_REFRESH
    now = time.time()
    if now - TOR_EXIT_LAST_REFRESH < 3600:
        return
    TOR_EXIT_LAST_REFRESH = now
    try:
        import socket
        addrs = socket.getaddrinfo("tor-exit-nodes.torproject.org", 80, socket.AF_INET)
        TOR_EXIT_NODES = {addr[4][0] for addr in addrs}
    except Exception:
        pass

def _is_suspicious_ip(ip: str) -> bool:
    """判断 IP 是否可能是恶意来源：Tor 出口节点、已知扫描 IP 段"""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback:
            return False
    except Exception:
        return False

    _refresh_tor_exit_nodes()
    if ip in TOR_EXIT_NODES:
        return True

    # 已知恶意 IP 段（常见海外机房/VPS 段）
    SUSPICIOUS_RANGES = [
        ipaddress.ip_network("45.148.10.0/24"),
        ipaddress.ip_network("45.148.0.0/17"),
        ipaddress.ip_network("195.178.110.0/24"),
        ipaddress.ip_network("79.127.0.0/16"),
        ipaddress.ip_network("95.163.0.0/16"),
        ipaddress.ip_network("107.170.0.0/16"),
    ]
    for network in SUSPICIOUS_RANGES:
        if isinstance(addr, ipaddress.IPv4Address) and addr in network:
            return True
    return False


def _load_blocked_ips() -> None:
    global BLOCKED_IPS
    try:
        if IP_BAN_FILE.exists():
            data = json.loads(IP_BAN_FILE.read_text())
            if isinstance(data, dict):
                BLOCKED_IPS = data
    except Exception as exc:
        logger.warning("读取封禁 IP 文件失败: %s", exc)
        BLOCKED_IPS = {}


def _save_blocked_ips() -> None:
    try:
        IP_BAN_FILE.write_text(json.dumps(BLOCKED_IPS, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("保存封禁 IP 文件失败: %s", exc)


def _is_private_or_local_ip(ip: str) -> bool:
    try:
        parsed = ipaddress.ip_address(ip)
        return parsed.is_private or parsed.is_loopback or parsed.is_link_local or parsed.is_reserved
    except Exception:
        return ip in {"unknown", "localhost"}


def _is_ip_blocked(ip: str) -> bool:
    info = BLOCKED_IPS.get(ip)
    if not info:
        return False
    expires_at = float(info.get("expires_at") or 0)
    if expires_at and expires_at <= time.time():
        BLOCKED_IPS.pop(ip, None)
        _save_blocked_ips()
        return False
    return True


def _ban_ip(ip: str, reason: str, path: str, ban_seconds: int = SCAN_BAN_SECONDS) -> None:
    if _is_private_or_local_ip(ip):
        return
    now = time.time()
    BLOCKED_IPS[ip] = {
        "reason": reason,
        "path": path[:300],
        "created_at": now,
        "expires_at": now + int(ban_seconds or SCAN_BAN_SECONDS),
    }
    _save_blocked_ips()
    logger.warning("已自动封禁扫描 IP %s: %s path=%s", ip, reason, path)


def _scan_path_reason(path: str, query: str = "") -> str | None:
    raw = f"{path}?{query}" if query else path
    decoded = unquote(raw).lower()
    for pattern in SCAN_PATH_PATTERNS:
        if pattern.search(decoded):
            return "命中扫描特征"
    return None


def _record_scan_hit(ip: str, reason: str, path: str, cfg: dict | None = None) -> None:
    if _is_private_or_local_ip(ip):
        return
    cfg = cfg or _security_config(None)
    if not cfg.get("auto_ban_enabled", True):
        return
    now = time.time()
    bucket = SCAN_SCORE_BUCKETS[ip]
    window = int(cfg.get("score_window_seconds") or SCAN_SCORE_WINDOW_SECONDS)
    threshold = int(cfg.get("score_threshold") or SCAN_SCORE_THRESHOLD)
    while bucket and bucket[0] <= now - window:
        bucket.popleft()
    bucket.append(now)
    if len(bucket) >= threshold or reason == "命中扫描特征":
        _ban_ip(ip, reason, path, int(cfg.get("ban_seconds") or SCAN_BAN_SECONDS))


_load_blocked_ips()

RATE_LIMIT_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
RATE_LIMIT_RULES = {
    "auth": (10, 300),          # 登录/注册/验证码：每 IP 5 分钟 10 次
    "check": (60, 60),         # 前缀可用性查询：每 IP 每分钟 60 次
    "write": (30, 300),        # 登录后的写操作：每账号/IP 5 分钟 30 次
    "admin": (120, 60),        # 管理端：每管理员/IP 每分钟 120 次
    "domain_search": (30, 60), # 官网域名实时搜索：每 IP/账号每分钟 30 次
    "public_report": (8, 300), # 公开举报提交：每 IP 5 分钟 8 次
}

REPORT_CAPTCHA_TTL_SECONDS = 600
REPORT_CAPTCHA_SECRET = f"report-captcha:{settings.secret_key}"

ALLOWED_DNS_TYPES = {"A", "AAAA", "CNAME", "MX", "TXT", "CAA"}
MAX_DNS_RECORDS_PER_SUBDOMAIN = 20
MIN_TTL = 14400
MAX_TTL = 86400


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    raw = forwarded or real_ip or (request.client.host if request.client else "unknown")
    try:
        return str(ipaddress.ip_address(raw))
    except Exception:
        return raw[:64] or "unknown"


# ── IP 指纹收集 ─────────────────────────────
def _record_fingerprint(
    db: Session,
    user_id: int | None,
    request: Request,
    action: str = "visit",
    body: dict | None = None,
) -> IpFingerprint:
    """记录访问者的 IP 指纹到数据库"""
    fp = IpFingerprint(
        user_id=user_id,
        ip=_client_ip(request)[:64],
        user_agent=(request.headers.get("user-agent") or "")[:500],
        accept_language=(request.headers.get("accept-language") or "")[:200],
        action=action,
    )
    # 如果请求体中包含客户端 JS 采集的指纹数据，一并保存
    if body:
        fp.screen_resolution = (body.get("screen_resolution") or "")[:50]
        fp.timezone = (body.get("timezone") or "")[:64]
        fp.platform = (body.get("platform") or "")[:64]
        fp.canvas_hash = (body.get("canvas_hash") or "")[:64]
        fp.fonts = json.dumps(body.get("fonts", []), ensure_ascii=False)[:5000] if body.get("fonts") else ""
        fp.browser_id = (body.get("browser_id") or "")[:128]
    db.add(fp)
    db.commit()
    return fp


def _rate_limit(request: Request, scope: str, identifier: str | None = None) -> None:
    limit, window = RATE_LIMIT_RULES.get(scope, (60, 60))
    ident = identifier or _client_ip(request)
    key = f"{scope}:{ident}"
    now = time.time()
    bucket = RATE_LIMIT_BUCKETS[key]
    while bucket and bucket[0] <= now - window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(429, detail="请求过于频繁，请稍后再试")
    bucket.append(now)


def _request_actor(request: Request, user: User | None = None) -> str:
    if user:
        return f"u{user.id}:{_client_ip(request)}"
    return _client_ip(request)


def _validate_record_payload(record_type: str, record_name: str, content: str, ttl: int) -> tuple[str, str, str, int]:
    record_type = (record_type or "").strip().upper()
    record_name = (record_name or "@").strip().lower()
    content = (content or "").strip()
    if record_type not in ALLOWED_DNS_TYPES:
        raise HTTPException(400, detail="不支持的 DNS 记录类型")
    if not content or len(content) > 500:
        raise HTTPException(400, detail="记录值不能为空且不能超过 500 字符")
    if len(record_name) > 255 or ".." in record_name or record_name.startswith("-") or record_name.endswith("-"):
        raise HTTPException(400, detail="记录名格式不正确")
    if record_name not in ("@", ""):
        labels = record_name.rstrip(".").split(".")
        if any((not x) or len(x) > 63 for x in labels):
            raise HTTPException(400, detail="记录名格式不正确")
        for label in labels:
            # TXT/CAA 等记录值可包含下划线，但记录名只允许普通 DNS label，避免 _acme-challenge 等系统记录被用户写入。
            if not label.replace("-", "").isalnum() or label.startswith("-") or label.endswith("-"):
                raise HTTPException(400, detail="记录名只能包含字母、数字、中划线和点号")
    if record_type in {"A", "AAAA"}:
        try:
            ipaddress.ip_address(content)
        except Exception:
            raise HTTPException(400, detail=f"{record_type} 记录值必须是有效 IP 地址")
        if record_type == "A" and ":" in content:
            raise HTTPException(400, detail="A 记录必须是 IPv4 地址")
        if record_type == "AAAA" and ":" not in content:
            raise HTTPException(400, detail="AAAA 记录必须是 IPv6 地址")
    if record_type == "CNAME":
        target = content.rstrip(".").lower()
        if not target or ".." in target or "." not in target:
            raise HTTPException(400, detail="CNAME 记录值必须是有效域名")
    ttl = int(ttl or 3600)
    if ttl < MIN_TTL or ttl > MAX_TTL:
        raise HTTPException(400, detail=f"TTL 必须在 {MIN_TTL}-{MAX_TTL} 秒之间")
    return record_type, record_name, content, ttl

# 内置系统前缀：任何根域名下都不能被普通用户认领。
# 作用：即使数据库 reserved_prefixes 为空/被误删，也保护根域名入口和常见系统服务名。
BUILTIN_RESERVED_PREFIXES = {
    "www", "@", "*", "root", "apex", "admin", "administrator", "api", "app", "apps",
    "auth", "cdn", "dashboard", "dev", "dns", "docs", "ftp", "gateway", "git", "imap",
    "mail", "mx", "ns", "ns1", "ns2", "pop", "pop3", "portal", "smtp", "ssh", "ssl",
    "status", "support", "test", "www1", "www2", "m", "mobile", "blog", "static",
    "assets", "img", "images", "files", "download", "downloads", "panel", "console",
    "manage", "manager", "cpanel", "webmail", "autodiscover", "_dmarc", "dkim", "selector1",
    "selector2", "default._domainkey", "_domainkey", "_acme-challenge",
}


def _normalize_prefix(prefix: str) -> str:
    return (prefix or "").strip().lower().rstrip(".")


def _validate_subdomain_prefix(prefix: str) -> str:
    """校验普通用户可认领的一级子域名前缀。"""
    prefix = _normalize_prefix(prefix)
    if not prefix:
        raise HTTPException(400, detail="缺少前缀")
    if prefix in BUILTIN_RESERVED_PREFIXES:
        raise HTTPException(400, detail="该前缀为系统保留前缀，不能注册")
    if "." in prefix or "_" in prefix:
        raise HTTPException(400, detail="前缀只能是一级子域名，不能包含点号或下划线")
    if not prefix.replace('-', '').isalnum() or prefix.startswith('-') or prefix.endswith('-'):
        raise HTTPException(400, detail="前缀只能包含字母、数字和中划线，且不能以中划线开头或结尾")
    if len(prefix) > 63:
        raise HTTPException(400, detail="前缀长度不能超过 63 个字符")
    return prefix


def _is_reserved_prefix(db: Session, prefix: str) -> bool:
    prefix = _normalize_prefix(prefix)
    if prefix in BUILTIN_RESERVED_PREFIXES:
        return True
    return db.query(ReservedPrefix).filter(ReservedPrefix.prefix == prefix).first() is not None


def _nicnames_record_name(sub: Subdomain, record_name: str) -> str:
    """把用户子域名记录名转换为 NicNames 根域名 zone 内的记录名。

    用户只能管理自己认领的 `prefix.root` 及其下级记录，不能传入 `www.root`、`root`、`@`
    等根域名/其它前缀记录名来覆盖公共入口。
    """
    name = (record_name or "@").strip().lower().rstrip(".")
    sub_fqdn = (sub.fqdn or f"{sub.prefix}.{sub.root_domain}").strip().lower().rstrip(".")
    root_domain = (sub.root_domain or "").strip().lower().rstrip(".")
    if not name or name == "@":
        return sub.prefix
    if name == root_domain or name.endswith(f".{root_domain}"):
        if name == sub_fqdn:
            return sub.prefix
        suffix = f".{sub_fqdn}"
        if name.endswith(suffix):
            relative = name[:-len(suffix)].rstrip(".")
            if not relative:
                return sub.prefix
            return f"{relative}.{sub.prefix}"
        raise HTTPException(400, detail="记录名必须位于你认领的子域名之下，不能操作根域名或其它前缀")
    if name.startswith("@") or ".." in name:
        raise HTTPException(400, detail="记录名格式不正确")
    return f"{name}.{sub.prefix}"

def _sync_nicnames_add(db: Session, sub: Subdomain, record_type: str, record_name: str, content: str, ttl: int) -> None:
    """同步添加 DNS 记录到 NicNames；失败直接抛错，避免本地成功但官网无记录。"""
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(500, detail="NicNames 未配置，无法同步 DNS")
    manager = NicNamesDNS(email=creds["email"], password=creds["password"])
    nic_name = _nicnames_record_name(sub, record_name)
    ok = manager.add_dns_record(sub.root_domain, nic_name, record_type, content, ttl)
    if not ok:
        raise HTTPException(500, detail="同步 NicNames DNS 失败")


def _sync_nicnames_delete(db: Session, sub: Subdomain, record_type: str, record_name: str, content: str) -> None:
    """同步删除 NicNames DNS 记录；删除失败直接抛错，避免本地和真实 DNS 状态不一致。"""
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(500, detail="NicNames 未配置，无法同步 DNS")
    manager = NicNamesDNS(email=creds["email"], password=creds["password"])
    domain_id = manager.resolve_domain_id(sub.root_domain)
    if not domain_id:
        raise HTTPException(500, detail="无法定位 NicNames 根域名 ID")
    nic_name = _nicnames_record_name(sub, record_name)
    ok = manager.delete_dns_record(domain_id, nic_name, record_type, content)
    if not ok:
        raise HTTPException(500, detail="同步删除 NicNames DNS 失败")


def _nicnames_record_claims_prefix(record: dict, prefix: str, root_domain: str) -> bool:
    """判断 NicNames DNS 真实记录是否已经占用某个一级前缀。

    只要 NicNames 中存在 `prefix.root` 或其下级记录（如 `x.prefix.root`），就认为该前缀已被占用；
    根域名自身记录（`root`/`@`）不占用任意前缀。
    """
    prefix = (prefix or "").strip().lower().rstrip(".")
    root_domain = (root_domain or "").strip().lower().rstrip(".")
    raw_name = str(record.get("name") or "").strip().lower().rstrip(".")
    if not prefix or not root_domain or not raw_name:
        return False
    if raw_name in ("@", root_domain):
        return False
    suffix = f".{root_domain}"
    if raw_name.endswith(suffix):
        relative = raw_name[: -len(suffix)].rstrip(".")
    else:
        relative = raw_name
    return relative == prefix or relative.endswith(f".{prefix}")


def _nicnames_prefix_taken(db: Session, prefix: str, root_domain: str) -> bool:
    """以 NicNames DNS 记录为准判断前缀是否已被占用。"""
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(500, detail="NicNames 未配置，无法校验真实 DNS 占用")
    manager = NicNamesDNS(email=creds["email"], password=creds["password"])
    records = manager.get_dns_records(root_domain)
    return any(_nicnames_record_claims_prefix(r, prefix, root_domain) for r in records)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

SYSTEM_DOMAINS = []

def _get_config(db: Session, key: str, default: str = "") -> str:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first() if db is not None else None
    return cfg.value if cfg and cfg.value is not None else default

def _bool_config(db: Session, key: str, default: bool = False) -> bool:
    raw = _get_config(db, key, "true" if default else "false")
    return str(raw).strip().lower() in ("1", "true", "yes", "on", "enabled", "开启")

def _set_config(db: Session, key: str, value: str) -> None:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if cfg:
        cfg.value = value
        cfg.updated_at = datetime.now(timezone.utc)
    else:
        db.add(SystemConfig(key=key, value=value))

def _int_config(db: Session | None, key: str, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    try:
        value = int(_get_config(db, key, str(default)))
    except Exception:
        value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value

def _security_config(db: Session | None = None) -> dict:
    """DNS Portal 应用层安全策略配置。只作用于二级域名分发站点。"""
    return {
        "scanner_enabled": _bool_config(db, "security_scanner_enabled", True),
        "auto_ban_enabled": _bool_config(db, "security_auto_ban_enabled", True),
        "ban_seconds": _int_config(db, "security_ban_seconds", SCAN_BAN_SECONDS, 300, 604800),
        "score_window_seconds": _int_config(db, "security_404_window_seconds", SCAN_SCORE_WINDOW_SECONDS, 60, 86400),
        "score_threshold": _int_config(db, "security_404_threshold", SCAN_SCORE_THRESHOLD, 2, 100),
        "force_https_admin_enabled": _bool_config(db, "security_force_https_admin_enabled", False),
        "admin_exempt_enabled": _bool_config(db, "security_admin_exempt_enabled", True),
        "suspicious_ip_ban_enabled": _bool_config(db, "security_suspicious_ip_ban_enabled", True),
        "login_fail_lock_enabled": _bool_config(db, "security_login_fail_lock_enabled", True),
        "register_domain_limit": _int_config(db, "security_register_domain_limit", REGISTER_LIMIT_PER_DOMAIN, 1, 50),
        "register_subnet_limit": _int_config(db, "security_register_subnet_limit", REGISTER_LIMIT_PER_SUBNET, 1, 50),
    }

def _domain_distribution_meta(db: Session | None, domain: str) -> dict:
    """根域名二级域名分发状态。默认开启；管理员可暂停某个根域名。"""
    domain = (domain or "").strip().lower()
    default = {
        "paused": False,
        "distribution_enabled": True,
        "pause_reason": "",
        "paused_at": None,
    }
    if db is None or not domain:
        return default
    cfg = db.query(SystemConfig).filter(SystemConfig.key == f"domain_distribution:{domain}").first()
    if not cfg or not cfg.value:
        return default
    try:
        data = json.loads(cfg.value)
    except Exception:
        return default
    paused = bool(data.get("paused", False))
    return {
        "paused": paused,
        "distribution_enabled": not paused,
        "pause_reason": data.get("reason") or data.get("pause_reason") or "",
        "paused_at": data.get("paused_at"),
    }

def _public_domain_enabled(domain: dict) -> bool:
    return not bool(domain.get("paused")) and bool(domain.get("distribution_enabled", True))

def _set_domain_distribution(db: Session, domain: str, paused: bool, reason: str = "") -> dict:
    payload = {
        "paused": bool(paused),
        "reason": (reason or "").strip(),
        "paused_at": datetime.now(timezone.utc).isoformat() if paused else None,
    }
    _set_config(db, f"domain_distribution:{domain}", json.dumps(payload, ensure_ascii=False))
    return _domain_distribution_meta(db, domain)

def _email_verify_key(email: str, purpose: str = "signup") -> str:
    return f"email_verify:{purpose}:{(email or '').strip().lower()}"

def _smtp_config(db: Session) -> dict:
    return {
        "host": _get_config(db, "smtp_host", ""),
        "port": int(_get_config(db, "smtp_port", "587") or "587"),
        "username": _get_config(db, "smtp_username", ""),
        "password": _get_config(db, "smtp_password", ""),
        "from_email": _get_config(db, "smtp_from_email", ""),
        "from_name": _get_config(db, "smtp_from_name", "DNS Portal"),
        "use_tls": _bool_config(db, "smtp_use_tls", True),
    }

def _send_email(db: Session, to_email: str, subject: str, content: str) -> None:
    cfg = _smtp_config(db)
    if not cfg["host"] or not cfg["from_email"]:
        raise HTTPException(400, detail="SMTP 邮箱发送配置未完成，请先到后台配置")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f'{cfg["from_name"]} <{cfg["from_email"]}>'
    msg["To"] = to_email
    msg.set_content(content)
    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
            if cfg["use_tls"]:
                server.starttls()
            if cfg["username"]:
                server.login(cfg["username"], cfg["password"])
            server.send_message(msg)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("发送邮箱验证码失败: %s", e)
        raise HTTPException(500, detail=f"发送验证码失败：{e}")

ALLOWED_REGISTRATION_EMAIL_DOMAINS = {"qq.com", "gmail.com", "googlemail.com"}

def _is_allowed_registration_email(email: str) -> bool:
    """注册邮箱白名单：仅允许 QQ 邮箱和 Google/Gmail 邮箱。"""
    email = (email or "").strip().lower()
    if "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1]
    return domain in ALLOWED_REGISTRATION_EMAIL_DOMAINS

def _require_allowed_registration_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not _is_allowed_registration_email(email):
        raise HTTPException(400, detail="注册邮箱只支持 QQ 邮箱或 Gmail/Google 邮箱")
    return email

def _issue_email_code(db: Session, email: str, purpose: str = "signup") -> None:
    email = (email or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, detail="邮箱格式不正确")
    code = f"{secrets.randbelow(1000000):06d}"
    payload = {"code": hashlib.sha256(code.encode()).hexdigest(), "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}
    _set_config(db, _email_verify_key(email, purpose), json.dumps(payload, ensure_ascii=False))
    _send_email(db, email, "DNS Portal 注册验证码", f"你的 DNS Portal 注册验证码是：{code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略。")
    db.commit()

def _verify_email_code(db: Session, email: str, code: str, purpose: str = "signup") -> None:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == _email_verify_key(email, purpose)).first()
    if not cfg or not cfg.value:
        raise HTTPException(400, detail="请先获取邮箱验证码")
    try:
        payload = json.loads(cfg.value)
        expires_at = datetime.fromisoformat(payload.get("expires_at"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, detail="验证码状态异常，请重新获取")
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, detail="验证码已过期，请重新获取")
    if hashlib.sha256((code or "").strip().encode()).hexdigest() != payload.get("code"):
        raise HTTPException(400, detail="验证码错误")
    db.delete(cfg)

def _domain_price(db: Session | None, name: str, fallback: int | None = None) -> int:
    if db is None:
        return 10 if fallback is None else fallback
    raw = _get_config(db, f"domain_price:{name}", "") or _get_config(db, "domain_default_price", "10")
    try:
        price = int(raw)
    except Exception:
        price = 10 if fallback is None else fallback
    return max(price, 0)


def _detect_public_ip() -> str:
    """Best-effort current server public IPv4 detection. Never returns a hard-coded IP."""
    env_ip = (os.getenv("DNSPORTAL_SERVER_IP") or "").strip()
    if env_ip:
        try:
            return str(ipaddress.ip_address(env_ip))
        except Exception:
            logger.warning("DNSPORTAL_SERVER_IP is not a valid IP: %s", env_ip)
    services = (
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com",
    )
    for url in services:
        try:
            import requests
            value = requests.get(url, timeout=4).text.strip()
            ip = ipaddress.ip_address(value)
            if ip.version == 4 and not ip.is_private and not ip.is_loopback:
                return str(ip)
        except Exception as e:
            logger.debug("detect public ip failed via %s: %s", url, e)
    raise HTTPException(500, detail="无法自动获取当前服务器公网 IP，请在系统设置中配置默认注册 IP")


def _default_register_ip(db: Session) -> str:
    configured = (_get_config(db, "default_register_ip", "") or "").strip()
    if configured:
        try:
            return str(ipaddress.ip_address(configured))
        except Exception:
            raise HTTPException(400, detail="系统设置 default_register_ip 不是有效 IP")
    detected = _detect_public_ip()
    _set_config(db, "default_register_ip_detected", detected)
    return detected


def _premium_prefix_rule(db: Session, prefix: str) -> PremiumPrefix | None:
    prefix = _normalize_prefix(prefix)
    rules = db.query(PremiumPrefix).all()
    best = None
    for rule in rules:
        key = (rule.prefix or "").strip().lower()
        if not key:
            continue
        if prefix == key or prefix.startswith(key):
            if best is None or len(key) > len(best.prefix or ""):
                best = rule
    return best


def _registration_price(db: Session, prefix: str, root_domain: str, domain_info: dict | None = None) -> dict:
    """Compute final registration price from base domain price + premium prefix override/multiplier."""
    base = _domain_price(db, root_domain, (domain_info or {}).get("credits", 10))
    price = base
    reasons = []
    rule = _premium_prefix_rule(db, prefix)
    if rule:
        multiplier = float(rule.price_multiplier or 1.0)
        if multiplier >= 100:
            # 兼容旧 UI/用户习惯：输入 1000 表示固定 1000 积分，而不是 10 倍/1000 倍。
            price = int(round(multiplier))
            reasons.append({"type": "premium_prefix", "prefix": rule.prefix, "mode": "fixed", "price": price})
        else:
            price = int(round(base * multiplier))
            reasons.append({"type": "premium_prefix", "prefix": rule.prefix, "mode": "multiplier", "multiplier": multiplier})
    return {"price": max(int(price), 0), "base_price": base, "premium": bool(reasons), "rules": reasons}


def _domain_meta(name: str, credits: int = 10, description: str = ""):
    return {"name": name, "credits": credits, "description": description or "可用于自助创建子域名"}

def get_system_domains(db: Session | None = None, include_paused: bool = True):
    """Return root domains available for users.

    显示来源：优先实时读取 NicNames 账号域名；失败时使用最近一次成功缓存；最后再使用后台手动添加的根域名。
    价格来源：domain_price:<root> 覆盖价，否则 domain_default_price，默认 10 积分。
    """
    domains = []
    seen = set()

    def add_domain(name: str, meta: dict | None = None, source: str = "local"):
        nonlocal domains, seen
        meta = meta or {}
        name = (name or "").strip().lower()
        if not name or name in seen:
            return
        seen.add(name)
        expiry = meta.get("expiry") or meta.get("expires_at")
        price = _domain_price(db, name, int(meta.get("credits", 10) or 10))
        distribution = _domain_distribution_meta(db, name)
        domains.append({
            "id": len(domains) + 1,
            "name": name,
            "credits": price,
            "description": meta.get("description") or (f"NicNames 域名，有效期至 {expiry or '未知'}" if source in ("nicnames", "cache") else "管理员添加的根域名"),
            "source": source,
            "nicnames_id": meta.get("id") or meta.get("nicnames_id"),
            "expiry": expiry,
            **distribution,
        })

    live_failed = False
    if db is not None:
        creds = load_credentials(db)
        if creds:
            try:
                manager = NicNamesDNS(email=creds["email"], password=creds["password"])
                live_items = manager.get_domains()
                for item in live_items:
                    add_domain(item.get("name"), item, "nicnames")
                if live_items:
                    cfg = db.query(SystemConfig).filter(SystemConfig.key == "nicnames_domains_cache").first()
                    payload = json.dumps(live_items, ensure_ascii=False)
                    if cfg:
                        cfg.value = payload; cfg.updated_at = datetime.now(timezone.utc)
                    else:
                        db.add(SystemConfig(key="nicnames_domains_cache", value=payload))
                    db.commit()
            except Exception as e:
                live_failed = True
                logger.warning(f"读取 NicNames 域名失败，使用缓存/本地配置兜底: {e}")

        if not domains:
            cache = db.query(SystemConfig).filter(SystemConfig.key == "nicnames_domains_cache").first()
            if cache and cache.value:
                try:
                    for item in json.loads(cache.value):
                        add_domain(item.get("name"), item, "cache")
                except Exception as e:
                    logger.warning(f"读取 NicNames 域名缓存失败: {e}")

        extras = db.query(SystemConfig).filter(SystemConfig.key.like("system_domain:%")).all()
        for cfg in extras:
            name = cfg.key.split(":", 1)[1].strip().lower()
            try:
                meta = json.loads(cfg.value or "{}")
            except Exception:
                meta = {}
            add_domain(name, meta, "local")

    if not domains:
        for d in SYSTEM_DOMAINS:
            name = d["name"]
            add_domain(name, d, "builtin")
    if not include_paused:
        domains = [d for d in domains if _public_domain_enabled(d)]
    for idx, d in enumerate(domains, 1):
        d["id"] = idx
    return domains

app = FastAPI(title=settings.app_name)

# ── 确保默认用户组存在 ──────────────────────────
def ensure_default_group(db: Session):
    """启动时自动创建默认用户组（如不存在）"""
    g = db.query(UserGroup).filter(UserGroup.is_default == True).first()
    if not g:
        g = UserGroup(name="默认用户组", is_default=True)
        db.add(g)
        db.commit()
    return g

@app.on_event("startup")
async def _startup_ensure_default_group():
    """应用启动时确保默认用户组存在"""
    db = SessionLocal()
    try:
        ensure_default_group(db)
    finally:
        db.close()

@app.middleware("http")
async def security_headers_and_transport(request: Request, call_next):
    client_ip = _client_ip(request)
    path = request.url.path
    query = request.url.query
    db = SessionLocal()
    current_user = None
    try:
        security_cfg = _security_config(db)
        current_user = get_user_from_request(request, db)
    finally:
        db.close()

    # 默认管理员入口、管理员已登录请求不受扫描封禁策略影响，避免管理员因误封无法进入后台。
    admin_exempt = bool(security_cfg.get("admin_exempt_enabled", True)) and (
        path.startswith(("/admin", "/api/admin")) or path == "/api/auth/sign-in"
        or getattr(current_user, "role", None) == "admin"
    )

    if security_cfg.get("scanner_enabled", True) and not admin_exempt:
        if _is_ip_blocked(client_ip):
            return JSONResponse({"detail": "IP 已被安全策略封禁"}, status_code=403)

        # 可疑 IP（Tor 出口节点、已知恶意段）直接封禁
        if security_cfg.get("suspicious_ip_ban_enabled", True) and _is_suspicious_ip(client_ip):
            _ban_ip(client_ip, "可疑来源 IP", path, int(security_cfg.get("ban_seconds") or SCAN_BAN_SECONDS))
            return JSONResponse({"detail": "检测到可疑来源，IP 已封禁"}, status_code=403)

        scan_reason = _scan_path_reason(path, query)
        if scan_reason:
            _record_scan_hit(client_ip, scan_reason, f"{path}?{query}" if query else path, security_cfg)
            return JSONResponse({"detail": "检测到扫描行为，IP 已封禁"}, status_code=403)

    # HTTPS 强制跳转默认关闭，避免未配置受信证书时误伤后台；可在 DNS Portal 系统设置中开启。
    proto = request.headers.get("x-forwarded-proto", "")
    if (not admin_exempt) and security_cfg.get("force_https_admin_enabled") and proto == "http" and request.url.path.startswith(("/api/", "/admin", "/dashboard", "/login")):
        https_url = str(request.url).replace("http://", "https://", 1)
        return RedirectResponse(https_url, status_code=301)
    response = await call_next(request)
    # 不再因普通 /api 404 自动封 IP：前端版本切换、登录态刷新、旧接口请求都可能产生正常 404。
    # 明确扫描特征仍会在 call_next 前拦截；这里只对后台/静态资源探测计分。
    if (not admin_exempt) and security_cfg.get("scanner_enabled", True) and response.status_code == 404 and path.startswith(("/admin", "/assets/")):
        _record_scan_hit(client_ip, "连续探测不存在路径", path, security_cfg)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if proto == "https" or request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
    return response

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(plain.encode()).hexdigest(), hashed or "")

def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)

def verify_token(token: str):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None

def get_user_from_request(request: Request, db: Session):
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("token")
    if not token:
        return None
    payload = verify_token(token)
    if not payload:
        return None
    return db.query(User).filter(User.id == payload.get("user_id")).first()

# ─── SPA static files ───
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="spa-assets")

# ─── Download route (before SPA catch-all) ───
import mimetypes
from fastapi.responses import FileResponse as FR

@app.get("/download/{filename:path}")
async def download_file(filename: str):
    file_path = STATIC_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "File not found")
    mt, _ = mimetypes.guess_type(str(file_path))
    return FR(str(file_path), media_type=mt or "application/octet-stream", filename=filename)

# NOTE: The catch-all SPA static file route for /favicon.ico etc.
# is registered at the END of this file (after all API routes) to
# avoid intercepting /api/* paths. See register_spa_catch_all().

# ══════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════

@app.get("/api/domains")
async def get_domains(db: Session = Depends(get_db)):
    return {"domains": get_system_domains(db, include_paused=False)}


NICNAMES_DOMAIN_ATTR_QUERY = """
query getDomainNamesTiny($domains: [String]) {
  domainNames(
    sort: "priceOrder:ASC"
    filters: {code: {in: $domains}, pageEnabled: {eq: true}, productId: {ne: "0"}}
    pagination: {pageSize: 10000}
  ) {
    documentId
    domain
    productId
    resultsOrder
    priceOrder
    pageEnabled
    registrationEnabled
    code
  }
}
"""
_DOMAIN_ATTR_CACHE: dict[str, object] = {"expires": 0, "items": [], "by_id": {}, "pricing": {}, "bundles_expires": 0, "bundles": []}


def _amount_to_usd(amount: int | float | None) -> float | None:
    if amount is None:
        return None
    try:
        return round(float(amount) / 100, 2)
    except Exception:
        return None


def _normalize_domain_query(q: str) -> str:
    q = (q or "").strip().lower().removeprefix("http://").removeprefix("https://")
    q = q.split("/")[0].split("?")[0].strip().strip(".")
    if not q or len(q) > 80 or ".." in q:
        raise HTTPException(400, detail="请输入有效域名关键词")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,78}[a-z0-9]", q):
        raise HTTPException(400, detail="域名只能包含字母、数字、中划线和点号")
    return q


def _fetch_nicnames_domain_catalog(force: bool = False) -> tuple[dict, dict]:
    now = time.time()
    if not force and _DOMAIN_ATTR_CACHE.get("expires", 0) > now:
        return _DOMAIN_ATTR_CACHE.get("by_id", {}), _DOMAIN_ATTR_CACHE.get("pricing", {})

    import requests
    attr_resp = requests.post(
        "https://nicnames.com/api/strapi/graphql",
        json={"query": NICNAMES_DOMAIN_ATTR_QUERY, "operationName": "getDomainNamesTiny"},
        timeout=30,
    )
    attr_resp.raise_for_status()
    attrs = attr_resp.json().get("data", {}).get("domainNames", []) or []
    by_id = {str(x.get("documentId")): x for x in attrs if x.get("documentId")}
    product_ids = sorted({str(x.get("productId")) for x in attrs if x.get("productId")})

    pricing_by_product: dict[str, dict] = {}
    if product_ids:
        price_resp = requests.get(
            "https://nicnames.com/api/product/pricing",
            params={"ids": ",".join(product_ids)},
            timeout=30,
        )
        price_resp.raise_for_status()
        for item in price_resp.json() or []:
            if item.get("operation") == "CREATE" and item.get("periodUnit") == "YEARS" and int(item.get("periodDuration") or 0) == 1:
                pid = str(item.get("productId"))
                current = pricing_by_product.get(pid)
                if current is None or int(item.get("amount") or 0) < int(current.get("amount") or 10**12):
                    pricing_by_product[pid] = item

    _DOMAIN_ATTR_CACHE.update({"expires": now + 6 * 60 * 60, "items": attrs, "by_id": by_id, "pricing": pricing_by_product})
    return by_id, pricing_by_product


def _fetch_nicnames_bundles(force: bool = False) -> list[dict]:
    now = time.time()
    if not force and _DOMAIN_ATTR_CACHE.get("bundles_expires", 0) > now:
        return _DOMAIN_ATTR_CACHE.get("bundles", []) or []
    import requests
    resp = requests.get("https://nicnames.com/api/product/bundles", timeout=30)
    resp.raise_for_status()
    bundles = resp.json() or []
    _DOMAIN_ATTR_CACHE.update({"bundles_expires": now + 6 * 60 * 60, "bundles": bundles})
    return bundles


def _make_nicnames_bundle_results(base_label: str, results: list[dict], by_id: dict, pricing_by_product: dict) -> list[dict]:
    by_product = {str(x.get("product_id")): x for x in results if x.get("product_id")}
    out = []
    for bundle in _fetch_nicnames_bundles():
        domains = []
        all_available = True
        for product in bundle.get("products") or []:
            pid = str(product.get("productId") or "")
            match = by_product.get(pid)
            if not match:
                continue
            all_available = all_available and bool(match.get("available"))
            domains.append({
                "domain": match.get("domain"),
                "tld": match.get("tld"),
                "product_id": pid,
                "status": match.get("status"),
                "available": match.get("available"),
                "price": _amount_to_usd(product.get("price")),
                "period": f"{int(product.get('periodDuration') or 1)} 年" if product.get("periodUnit") == "YEARS" else "1 次",
                "free_in_bundle": _amount_to_usd(product.get("price")) == 0,
                "price_expression": product.get("priceExpression") or "",
            })
        if len(domains) < 2:
            continue
        out.append({
            "kind": "bundle",
            "slug": bundle.get("slug"),
            "product_id": str(bundle.get("productId") or ""),
            "title": " + ".join(d["domain"] for d in domains if d.get("domain")),
            "domains": domains,
            "domain_count": len(domains),
            "available": all_available,
            "currency": bundle.get("currency") or "USD",
            "price": _amount_to_usd(bundle.get("price")),
            "initial_price": _amount_to_usd(bundle.get("initialAmount")),
            "period": "组合首年",
            "source": "bundle",
            "results_order": bundle.get("resultsOrder") or 9999,
        })
    out.sort(key=lambda x: (x.get("results_order") or 9999, x.get("price") is None, x.get("price") or 999999))
    return out


def _search_nicnames_official(query: str) -> dict:
    """Proxy NicNames official search without exposing the site owner's credentials."""
    import requests
    normalized = _normalize_domain_query(query)
    start_resp = requests.post(
        "https://nicnames.com/api/search/start",
        data=json.dumps({"key": normalized, "domains": [], "cft": "abc"}),
        headers={"Content-Type": "text/plain;charset=UTF-8", "Accept": "application/json"},
        timeout=20,
    )
    start_resp.raise_for_status()
    ids = start_resp.json().get("ids") or []
    if not ids:
        raise HTTPException(502, detail="NicNames 未返回搜索任务")

    search_id = ids[0]
    data = None
    for _ in range(10):
        result_resp = requests.get(
            "https://nicnames.com/api/search/results",
            params={"id": search_id},
            headers={"Accept": "application/json"},
            timeout=20,
        )
        result_resp.raise_for_status()
        data = result_resp.json()
        if data.get("status") == "complete":
            break
        time.sleep(0.8)

    by_id, pricing_by_product = _fetch_nicnames_domain_catalog()
    results = []
    for item in (data or {}).get("results", []) or []:
        fqdn = item.get("fqdn") or ""
        if not fqdn:
            continue
        attr = by_id.get(str(item.get("domainId"))) or {}
        product_id = str(attr.get("productId") or "")
        pricing = pricing_by_product.get(product_id) or {}
        custom = (item.get("customPricing") or [{}])[0] if item.get("customPricing") else {}
        raw_amount = custom.get("amount") if custom else pricing.get("amount")
        raw_initial = pricing.get("initialAmount")
        results.append({
            "domain": fqdn,
            "tld": attr.get("domain") or fqdn.split(".")[-1],
            "status": item.get("status") or "checking",
            "available": item.get("status") == "available",
            "premium": bool(item.get("premium") or item.get("specialPricing")),
            "product_id": product_id,
            "currency": custom.get("currency") or pricing.get("currency") or "USD",
            "price": _amount_to_usd(raw_amount),
            "initial_price": _amount_to_usd(raw_initial),
            "period": "1 年",
            "source": item.get("source") or "official",
            "reason": item.get("reason") or "",
        })

    bundles = _make_nicnames_bundle_results(normalized, results, by_id, pricing_by_product)
    # 官网搜索结果会把用户输入的精确目标域名放在最上面；不要只按价格排序，否则 hugojin.com 这类精确查询会被便宜后缀挤到下面。
    results.sort(key=lambda x: (x["domain"] != normalized, not x["available"], x["price"] is None, x["price"] or 999999, x["domain"]))
    return {
        "query": normalized,
        "search_id": search_id,
        "status": (data or {}).get("status", "unknown"),
        "search_time": (data or {}).get("searchTime"),
        "results": results[:120],
        "bundles": bundles,
        "bundle_count": len(bundles),
        "count": len(results),
        "source_url": f"https://nicnames.com/en/domains/search/{search_id}",
    }


@app.get("/api/nicnames/domain-search")
async def public_nicnames_domain_search(q: str, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    _rate_limit(request, "domain_search", _request_actor(request, user))
    try:
        return await run_in_threadpool(_search_nicnames_official, q)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"NicNames 域名搜索失败: {e}")
        raise HTTPException(502, detail="NicNames 实时搜索失败，请稍后重试")


def _make_report_captcha(request: Request) -> dict:
    a = secrets.randbelow(8) + 2
    b = secrets.randbelow(8) + 2
    exp = int(time.time()) + REPORT_CAPTCHA_TTL_SECONDS
    nonce = secrets.token_urlsafe(8)
    payload = f"{a + b}:{exp}:{nonce}:{_client_ip(request)}"
    sig = hmac.new(REPORT_CAPTCHA_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = f"{payload}:{sig}"
    return {"question": f"{a} + {b} = ?", "token": token, "expires_in": REPORT_CAPTCHA_TTL_SECONDS}


def _verify_report_captcha(request: Request, token: str, answer: str) -> None:
    parts = (token or "").split(":")
    if len(parts) != 5:
        raise HTTPException(400, detail="验证码无效，请刷新后重试")
    expected, exp, nonce, ip, sig = parts
    payload = f"{expected}:{exp}:{nonce}:{ip}"
    good_sig = hmac.new(REPORT_CAPTCHA_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good_sig) or ip != _client_ip(request):
        raise HTTPException(400, detail="验证码无效，请刷新后重试")
    try:
        if int(exp) < int(time.time()):
            raise ValueError("expired")
        if int(str(answer or "").strip()) != int(expected):
            raise ValueError("wrong")
    except ValueError:
        raise HTTPException(400, detail="验证码错误或已过期")


@app.get("/api/public/report-captcha")
async def public_report_captcha(request: Request):
    _rate_limit(request, "public_report")
    return _make_report_captcha(request)


@app.post("/api/public/reports")
async def public_submit_report(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "public_report")
    body = await request.json()
    _verify_report_captcha(request, body.get("captcha_token", ""), body.get("captcha_answer", ""))
    site_url = (body.get("site_url") or body.get("url") or "").strip()
    site_name = (body.get("site_name") or body.get("domain") or "").strip()
    reason_type = (body.get("reason_type") or body.get("type") or "").strip()
    reason = (body.get("reason") or body.get("description") or "").strip()
    contact = (body.get("contact") or "").strip()
    if not site_url and not site_name:
        raise HTTPException(400, detail="请填写被举报域名或 URL")
    if len(site_url) > 500 or len(site_name) > 128:
        raise HTTPException(400, detail="域名或 URL 过长")
    if len(reason) < 8:
        raise HTTPException(400, detail="请补充至少 8 个字的举报说明")
    if len(reason) > 2000 or len(contact) > 128:
        raise HTTPException(400, detail="举报内容过长")
    combined_reason = f"类型：{reason_type or '其他'}\n说明：{reason}"
    if contact:
        combined_reason += f"\n联系方式：{contact}"
    combined_reason += f"\n提交 IP：{_client_ip(request)}"
    item = Moderation(type="abuse", site_name=site_name or site_url[:128], site_url=site_url, reason=combined_reason, status="pending")
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"success": True, "id": item.id, "message": "举报已提交，后台已收到"}


@app.get("/api/public/featured-sites")
async def public_featured_sites(db: Session = Depends(get_db)):
    items = db.query(Moderation).filter(
        Moderation.type == "showcase",
        Moderation.status == "approved",
    ).order_by(Moderation.id.desc()).limit(60).all()
    return {"items": [_showcase_payload(m, db) for m in items]}


@app.post("/api/public/featured-sites")
async def public_submit_featured_site(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "public_report")
    body = await request.json()
    _verify_report_captcha(request, body.get("captcha_token", ""), body.get("captcha_answer", ""))
    site_name = (body.get("site_name") or body.get("name") or "").strip()
    site_url = (body.get("site_url") or body.get("url") or "").strip()
    description = (body.get("description") or body.get("reason") or "").strip()
    contact = (body.get("contact") or "").strip()
    avatar_url = _valid_optional_url(body.get("avatar_url", ""), "头像 URL")
    owner_name = _normalize_owner_name(body.get("owner_name") or body.get("username") or "")
    if not site_name:
        raise HTTPException(400, detail="请填写站点名称")
    if not site_url:
        raise HTTPException(400, detail="请填写站点 URL")
    if len(site_name) > 128 or len(site_url) > 500:
        raise HTTPException(400, detail="站点名称或 URL 过长")
    if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", site_url, re.IGNORECASE):
        raise HTTPException(400, detail="请填写 http:// 或 https:// 开头的有效 URL")
    if len(description) < 8:
        raise HTTPException(400, detail="请补充至少 8 个字的站点介绍")
    if len(description) > 2000 or len(contact) > 128:
        raise HTTPException(400, detail="站点介绍或联系方式过长")
    combined_reason = f"类型：站点展示申请\n说明：{description}"
    if contact:
        combined_reason += f"\n联系方式：{contact}"
    combined_reason += f"\n提交 IP：{_client_ip(request)}"
    item = Moderation(
        type="showcase",
        site_name=site_name,
        site_url=site_url,
        avatar_url=avatar_url,
        owner_name=owner_name,
        reason=combined_reason,
        status="pending",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"success": True, "id": item.id, "message": "站点已提交，等待后台审核"}

@app.get("/api/public/auth-config")
async def public_auth_config(db: Session = Depends(get_db)):
    gcfg = _oidc_provider_config(db, "github")
    lcfg = _oidc_provider_config(db, "linuxdo")
    github_configured = bool(gcfg and gcfg.get("client_id") and gcfg.get("client_secret"))
    linuxdo_configured = bool(lcfg and lcfg.get("client_id") and lcfg.get("client_secret"))
    return {
        "login_enabled": _bool_config(db, "login_enabled", True),
        "registration_enabled": _bool_config(db, "registration_enabled", True),
        "email_login_enabled": _bool_config(db, "email_login_enabled", True),
        "email_registration_enabled": _bool_config(db, "email_registration_enabled", True),
        "oidc_login_enabled": _bool_config(db, "oidc_login_enabled", True),
        "oidc_registration_enabled": _bool_config(db, "oidc_registration_enabled", True),
        "registration_code_required": _bool_config(db, "registration_code_required", False),
        "email_verification_required": _bool_config(db, "email_verification_required", True),
        "providers": [
            {"key": "nicnames", "name": "NicNames", "enabled": True, "description": "当前生产 DNS 供应商"},
            {"key": "cloudflare", "name": "Cloudflare", "enabled": False, "description": "预留多供应商扩展"},
        ],
        "oidc_providers": [
            {"key": "github", "name": "GitHub", "enabled": github_configured,
             "description": "GitHub OIDC 登录" if github_configured else "未配置"},
            {"key": "linuxdo", "name": "Linux.do", "enabled": linuxdo_configured,
             "description": "Linux.do OIDC 登录" if linuxdo_configured else "未配置"},
        ],
    }

@app.post("/api/auth/sign-in")
async def sign_in(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "auth")
    body = await request.json()
    username = body.get("username", "")
    password = body.get("password", "")
    remember = body.get("remember", True)

    client_ip = _client_ip(request)
    login_key = f"{username}:{client_ip}"

    # 登录失败锁定检查
    if _is_login_locked(login_key):
        raise HTTPException(429, detail="登录失败次数过多，请 30 分钟后重试")

    user = db.query(User).filter((User.username == username) | (User.email == username)).first()
    if not user or not verify_password(password, user.hashed_password):
        _record_login_fail(login_key)
        raise HTTPException(401, detail="用户名或密码错误")
    if user.banned_at:
        raise HTTPException(403, detail="账号已被封禁")
    # 登录入口永远可见；关闭登录只限制普通用户，不影响管理员回到后台。
    if user.role != "admin" and (not _bool_config(db, "login_enabled", True) or not _bool_config(db, "email_login_enabled", True)):
        raise HTTPException(403, detail="普通用户登录已关闭")
    token = create_token({"user_id": user.id, "username": user.username, "role": user.role})
    max_age = 86400 * 30 if remember else 86400 * 7
    # 记录登录指纹
    try:
        db_fp = SessionLocal()
        _record_fingerprint(db_fp, user.id, request, "login", body)
        db_fp.close()
    except Exception:
        pass
    return JSONResponse({
        "token": token,
        "user": user_to_dict(user),
    })

@app.post("/api/auth/send-email-code")
async def auth_send_email_code(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "auth")
    if not _bool_config(db, "registration_enabled", True) or not _bool_config(db, "email_registration_enabled", True):
        raise HTTPException(403, detail="注册已关闭")
    body = await request.json()
    email = _require_allowed_registration_email(body.get("email") or "")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, detail="邮箱已被注册")
    _issue_email_code(db, email, "signup")
    return {"success": True, "message": "验证码已发送，请查收邮箱"}

@app.post("/api/auth/sign-up")
async def sign_up(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "auth")
    if not _bool_config(db, "registration_enabled", True) or not _bool_config(db, "email_registration_enabled", True):
        raise HTTPException(403, detail="注册已关闭")
    body = await request.json()
    username = body.get("username", "")
    email = _require_allowed_registration_email(body.get("email") or "")
    password = body.get("password", "")
    invite_code = (body.get("invite_code", "") or "").strip()
    email_code = (body.get("email_code", "") or "").strip()

    # 注册频率限制：按邮箱域名和 IP 子网
    client_ip = _client_ip(request)
    _check_register_limit(email, client_ip)

    if len(username) < 3 or len(username) > 32:
        raise HTTPException(400, detail="用户名长度需 3-32 个字符")
    if len(password) < 6:
        raise HTTPException(400, detail="密码至少 6 个字符")
    if db.query(User).filter((User.username == username) | (User.email == email)).first():
        raise HTTPException(400, detail="用户名或邮箱已被注册")
    
    if _bool_config(db, "email_verification_required", True):
        _verify_email_code(db, email, email_code, "signup")

    # 邀请码必须真实存在：开启强制邀请码时不能为空；只要填写了邀请码，也不能乱写。
    if _bool_config(db, "registration_code_required", False) and not invite_code:
        raise HTTPException(400, detail="需要邀请码才能注册")
    inviter_id = None
    if invite_code:
        inviter = db.query(User).filter(User.referral_code == invite_code).first()
        if not inviter:
            raise HTTPException(400, detail="邀请码无效")
        inviter_id = inviter.id

    user = User(username=username, email=email, hashed_password=hash_password(password))
    user.referral_code = username[:16]
    user.credits = 10  # registration bonus
    
    # 自动分配默认用户组
    default_group = db.query(UserGroup).filter(UserGroup.is_default == True).first()
    if default_group:
        user.group_id = default_group.id
    
    if inviter_id:
        user.invited_by = inviter_id
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Record registration bonus transaction
    db.add(Transaction(user_id=user.id, type="grant", amount=10, balance=10, description="Registration bonus"))
    
    # Handle referral reward
    if inviter_id:
        # Give inviter 10 credits
        inviter = db.query(User).filter(User.id == inviter_id).first()
        if inviter:
            inviter.credits += 10
            db.add(Transaction(user_id=inviter.id, type="grant", amount=10, balance=inviter.credits,
                description=f"Referral reward from {username}"))
            db.add(InviteRecord(inviter_id=inviter.id, friend_id=user.id, friend_username=username, verified=True, reward=10))
    
    db.commit()
    
    # 记录注册指纹
    _record_fingerprint(db, user.id, request, "signup", body)
    
    token = create_token({"user_id": user.id, "username": user.username, "role": user.role})
    return JSONResponse({"token": token, "user": user_to_dict(user)})


# ══════════════════════════════════════════════
# OIDC LOGIN
# ══════════════════════════════════════════════

OIDC_PROVIDERS = {
    "github": {
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "user_url": "https://api.github.com/user",
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "scope": "read:user",
        "username_field": "login",
        "email_field": "email",
        "avatar_field": "avatar_url",
        "id_field": "id",
    },
    "linuxdo": {
        "authorize_url": f"{settings.linuxdo_oidc_url}/oauth2/authorize",
        "token_url": f"{settings.linuxdo_oidc_url}/oauth2/token",
        "user_url": f"{settings.linuxdo_oidc_url}/api/user",
        "client_id": settings.linuxdo_client_id,
        "client_secret": settings.linuxdo_client_secret,
        "scope": "openid email profile",
        "username_field": "username",
        "email_field": "email",
        "avatar_field": "avatar_url",
        "id_field": "id",
    },
}

_OIDC_STATE_CLEANUP_CUTOFF = 600  # auto-clean states older than 10 min


def _oidc_provider_config(db: Session, provider: str) -> dict | None:
    """Read OIDC provider config from SystemConfig DB table (set via admin UI)."""
    base = {
        "github": {
            "authorize_url": "https://github.com/login/oauth/authorize",
            "token_url": "https://github.com/login/oauth/access_token",
            "user_url": "https://api.github.com/user",
            "scope": "read:user",
            "username_field": "login",
            "email_field": "email",
            "avatar_field": "avatar_url",
            "id_field": "id",
            "client_id_key": "github_client_id",
            "client_secret_key": "github_client_secret",
        },
        "linuxdo": {
            "authorize_url": f"{settings.linuxdo_oidc_url}/oauth2/authorize",
            "token_url": f"{settings.linuxdo_oidc_url}/oauth2/token",
            "user_url": f"{settings.linuxdo_oidc_url}/api/user",
            "scope": "openid email profile",
            "username_field": "username",
            "email_field": "email",
            "avatar_field": "avatar_url",
            "id_field": "id",
            "client_id_key": "linuxdo_client_id",
            "client_secret_key": "linuxdo_client_secret",
        },
    }
    if provider not in base:
        return None
    cfg = base[provider].copy()
    cfg["client_id"] = _get_config(db, cfg.pop("client_id_key"), "")
    cfg["client_secret"] = _get_config(db, cfg.pop("client_secret_key"), "")
    return cfg


def _calculate_oidc_signup_bonus(db: Session, provider: str, oidc_user: dict) -> int:
    """Calculate signup bonus credits based on OIDC provider and user info.
    
    Rules are read from system_config:
      oidc_bonus_github: JSON array of {"years_min":N,"years_max":N,"credits":N}
      oidc_bonus_linuxdo: JSON array of {"trust_level_min":N,"trust_level_max":N,"credits":N}
      oidc_bonus_default: int (fallback if no rule matches)
    """
    import json
    import re
    from datetime import datetime, timezone

    default_bonus = _int_config(db, "oidc_bonus_default", 10, min_value=0)

    if provider == "github":
        raw = _get_config(db, "oidc_bonus_github", "[]")
        try:
            rules = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default_bonus
        if not isinstance(rules, list):
            return default_bonus
        # Get GitHub account age in years from created_at
        created_at_str = oidc_user.get("created_at", "")
        if created_at_str:
            try:
                # GitHub format: "2011-04-10T20:10:04Z"
                created = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                years = (datetime.now(timezone.utc) - created).days / 365.25
                for rule in rules:
                    y_min = rule.get("years_min", 0)
                    y_max = rule.get("years_max", 999)
                    if y_min <= years < y_max:
                        return int(rule.get("credits", default_bonus))
            except (ValueError, TypeError):
                pass
        return default_bonus

    elif provider == "linuxdo":
        raw = _get_config(db, "oidc_bonus_linuxdo", "[]")
        try:
            rules = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default_bonus
        if not isinstance(rules, list):
            return default_bonus
        # Linux.do trust_level: 0-4
        trust_level = int(oidc_user.get("trust_level", 0))
        for rule in rules:
            tl_min = rule.get("trust_level_min", 0)
            tl_max = rule.get("trust_level_max", 999)
            if tl_min <= trust_level < tl_max:
                return int(rule.get("credits", default_bonus))
        return default_bonus

    else:
        return default_bonus


def _cleanup_oidc_states(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_OIDC_STATE_CLEANUP_CUTOFF)
    db.query(OIDCState).filter(OIDCState.created_at < cutoff).delete()
    db.commit()


@app.get("/api/auth/oidc/{provider}")
async def oidc_login(provider: str, request: Request, db: Session = Depends(get_db)):
    """Initiate OIDC login by redirecting to the provider."""
    cfg = _oidc_provider_config(db, provider)
    if not cfg:
        raise HTTPException(400, detail=f"不支持的 OIDC 提供商: {provider}")
    if not cfg["client_id"] or not cfg["client_secret"]:
        raise HTTPException(400, detail=f"{provider} OIDC 未配置")
    if not _bool_config(db, "oidc_login_enabled", True):
        raise HTTPException(403, detail="OIDC 登录已关闭")
    _cleanup_oidc_states(db)
    state = secrets.token_urlsafe(32)
    redirect_to = request.query_params.get("redirect", "/dashboard")
    intent = request.query_params.get("intent", "login")
    db.add(OIDCState(state=state, provider=provider, redirect_to=redirect_to, intent=intent))
    db.commit()
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": f"{settings.oidc_base_url}/api/auth/oidc/{provider}/callback",
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
    }
    from urllib.parse import urlencode
    qs = urlencode(params)
    return RedirectResponse(f"{cfg['authorize_url']}?{qs}")


@app.get("/api/auth/oidc/{provider}/callback")
async def oidc_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    """Handle OIDC callback and sign in / create user."""
    cfg = _oidc_provider_config(db, provider)
    if not cfg:
        raise HTTPException(400, detail=f"不支持的 OIDC 提供商: {provider}")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")
    if error:
        return _oidc_error_page(f"提供商标示了错误: {error}")
    if not code or not state:
        return _oidc_error_page("回调缺少 code 或 state 参数")

    # Verify state
    stored = db.query(OIDCState).filter(OIDCState.state == state, OIDCState.provider == provider).first()
    if not stored:
        return _oidc_error_page("state 无效或已过期，请重新发起登录")
    redirect_to = stored.redirect_to or "/dashboard"
    db.delete(stored)
    db.commit()

    # Exchange code for token
    import httpx
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            cfg["token_url"],
            data={
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "code": code,
                "redirect_uri": f"{settings.oidc_base_url}/api/auth/oidc/{provider}/callback",
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return _oidc_error_page(f"获取 token 失败: {token_data.get('error_description', token_data.get('error', '未知错误'))}")

        # Fetch user info
        user_resp = await client.get(
            cfg["user_url"],
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        if user_resp.status_code != 200:
            return _oidc_error_page(f"获取用户信息失败 (HTTP {user_resp.status_code})")
        oidc_user = user_resp.json()

    oidc_id = str(oidc_user.get(cfg["id_field"], ""))
    if not oidc_id:
        return _oidc_error_page("提供商标示的用户 ID 为空")
    login = oidc_user.get(cfg["username_field"], "") or oidc_id[:16]
    email = oidc_user.get(cfg["email_field"], "") or f"{login}@oidc.{provider}"
    avatar = oidc_user.get(cfg["avatar_field"], "") or ""

    # Check if this is a bind intent
    if stored.intent == "bind":
        # Bind to currently logged-in user
        current_user = get_user_from_request(request, db)
        if not current_user:
            return _oidc_error_page("请先登录后再绑定 OIDC 账号")
        # Check if OIDC is already bound to another user
        existing = db.query(User).filter(
            User.oidc_provider == provider,
            User.oidc_id == oidc_id,
        ).first()
        if existing and existing.id != current_user.id:
            return _oidc_error_page(f"此 {provider} 账号已绑定到其他用户")
        current_user.oidc_provider = provider
        current_user.oidc_id = oidc_id
        if avatar:
            current_user.oidc_avatar = avatar
        db.commit()
        token = create_token({"user_id": current_user.id, "username": current_user.username, "role": current_user.role})
        redirect_target = redirect_to if redirect_to.startswith("/") else "/settings"
        return RedirectResponse(f"{redirect_target}?token={token}", status_code=302)

    # Find or create user
    user = db.query(User).filter(
        User.oidc_provider == provider,
        User.oidc_id == oidc_id,
    ).first()

    if not user:
        # Also try matching by email (OIDC re-link)
        if email and "@oidc." not in email:
            user = db.query(User).filter(User.email == email).first()

    if not user:
        # Calculate OIDC signup bonus credits
        bonus_credits = _calculate_oidc_signup_bonus(db, provider, oidc_user)
        if not _bool_config(db, "oidc_registration_enabled", True):
            return _oidc_error_page("OIDC 自动注册已关闭，请联系管理员开通账号")
        # Create new user automatically
        base_username = login[:16]
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1
            if len(username) > 32:
                username = f"u{oidc_id[:10]}"
                break
        base_email = email[:255] if email and "@" in email else f"{login}@oidc.{provider}"
        user_email = base_email
        counter = 1
        while db.query(User).filter(User.email == user_email).first():
            name, domain = base_email.rsplit("@", 1)
            user_email = f"{name}{counter}@{domain}"
            counter += 1
        user = User(
            username=username,
            email=user_email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            oidc_provider=provider,
            oidc_id=oidc_id,
            oidc_avatar=avatar,
            credits=bonus_credits,
        )
        user.referral_code = username[:16]
        # 自动分配默认用户组
        default_group = db.query(UserGroup).filter(UserGroup.is_default == True).first()
        if default_group:
            user.group_id = default_group.id
        db.add(user)
        db.flush()
        db.add(Transaction(user_id=user.id, type="grant", amount=bonus_credits, balance=bonus_credits,
                description=f"OIDC {provider} 注册"))
        db.commit()
        db.refresh(user)
    else:
        # Update OIDC avatar on each login
        if avatar:
            user.oidc_avatar = avatar
        if not user.oidc_provider:
            user.oidc_provider = provider
        if not user.oidc_id:
            user.oidc_id = oidc_id
        db.commit()

    if user.banned_at:
        return _oidc_error_page("账号已被封禁")

    # Issue JWT and redirect back with token
    token = create_token({"user_id": user.id, "username": user.username, "role": user.role})
    redirect_target = redirect_to if redirect_to.startswith("/") else "/dashboard"
    return RedirectResponse(
        f"{redirect_target}?token={token}",
        status_code=302,
    )


def _oidc_error_page(msg: str) -> HTMLResponse:
    """Render a simple error page for OIDC failures."""
    return HTMLResponse(f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>OIDC 登录失败</title>
<style>body{{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}}
.card{{background:#fff;border-radius:12px;padding:2rem;max-width:480px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}}
h2{{color:#d32f2f}}p{{color:#555;margin:1rem 0}}
a{{color:#1976d2}}</style></head><body>
<div class="card"><h2>登录失败</h2><p>{msg}</p>
<p><a href="/">返回首页</a></p></div></body></html>""")


@app.get("/api/user/me")
async def get_me(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        return JSONResponse({"user": None})
    return {"user": user_to_dict(user)}

@app.post("/api/user/change-password")
async def change_password(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    if not verify_password(body.get("current_password", ""), user.hashed_password):
        raise HTTPException(400, detail="当前密码错误")
    user.hashed_password = hash_password(body["new_password"])
    db.commit()
    return {"success": True}

@app.post("/api/user/change-email")
async def change_email(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    email = _require_allowed_registration_email(body["email"])
    if db.query(User).filter(User.email == email, User.id != user.id).first():
        raise HTTPException(400, detail="邮箱已被注册")
    user.email = email
    db.commit()
    return {"success": True}

@app.post("/api/user/send-code")
async def send_code(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    email = _require_allowed_registration_email(body.get("email") or user.email or "")
    _issue_email_code(db, email, "change_email")
    return {"success": True, "message": "验证码已发送，请查收邮箱"}

@app.get("/api/user/invite")
async def get_invite(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    code = user.referral_code or user.username[:16]
    records = db.query(InviteRecord).filter(InviteRecord.inviter_id == user.id).all()
    earnings = sum(r.reward for r in records)
    return {
        "code": code,
        "link": f"https://dns.ccocc.cyou/invite/{code}",
        "count": len(records),
        "earnings": earnings,
        "records": [{"friend_username": r.friend_username, "verified": r.verified, "reward": r.reward, "created_at": r.created_at.isoformat()} for r in records],
    }

@app.put("/api/user/invite")
async def update_invite_code(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    code = body.get("code", "")
    if len(code) < 4 or len(code) > 16:
        raise HTTPException(400, detail="邀请码需要 4-16 个字符")
    existing = db.query(User).filter(User.referral_code == code, User.id != user.id).first()
    if existing:
        raise HTTPException(400, detail="邀请码已被使用")
    user.referral_code = code
    db.commit()
    return {"success": True}


# ── IP 指纹 API ────────────────────────────

@app.post("/api/user/fingerprint")
async def submit_fingerprint(request: Request, db: Session = Depends(get_db)):
    """客户端 JS 提交浏览器指纹数据"""
    user = get_user_from_request(request, db)
    body = await request.json()
    _record_fingerprint(db, user.id if user else None, request, "visit", body)
    return {"success": True}


@app.get("/api/user/fingerprint")
async def get_my_fingerprints(request: Request, db: Session = Depends(get_db)):
    """用户查看自己的指纹记录"""
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    records = db.query(IpFingerprint).filter(
        IpFingerprint.user_id == user.id
    ).order_by(IpFingerprint.id.desc()).limit(50).all()
    return {"fingerprints": [{
        "id": r.id,
        "ip": r.ip,
        "geo": query_ip(r.ip),
        "user_agent": r.user_agent,
        "accept_language": r.accept_language,
        "screen_resolution": r.screen_resolution,
        "timezone": r.timezone,
        "platform": r.platform,
        "canvas_hash": r.canvas_hash,
        "fonts": r.fonts[:200] if r.fonts else "",
        "browser_id": r.browser_id,
        "action": r.action,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in records]}


@app.get("/api/admin/users/fingerprints")
async def admin_get_user_fingerprints(
    request: Request,
    db: Session = Depends(get_db),
):
    """管理员查看所有指纹汇总 — 按用户 ID / IP 聚合"""
    admin = require_admin(request, db)
    search = (request.query_params.get("search") or "").strip()
    page = int(request.query_params.get("page", "1"))
    limit = 50

    from sqlalchemy import func
    subq = db.query(
        IpFingerprint.user_id,
        func.max(IpFingerprint.id).label("max_id"),
    ).filter(
        IpFingerprint.user_id.isnot(None),
    ).group_by(IpFingerprint.user_id).subquery()

    q = db.query(IpFingerprint).join(subq,
        (IpFingerprint.id == subq.c.max_id)
    ).filter(IpFingerprint.user_id.isnot(None))

    if search:
        q = q.filter(
            IpFingerprint.ip.ilike(f"%{search}%") |
            IpFingerprint.browser_id.ilike(f"%{search}%")
        )

    total = q.count()
    records = q.order_by(IpFingerprint.id.desc()).offset((page-1)*limit).limit(limit).all()

    return {
        "fingerprints": [{
            "id": r.id,
            "user_id": r.user_id,
            "ip": r.ip,
            "geo": query_ip(r.ip),
            "user_agent": (r.user_agent or "")[:200],
            "platform": r.platform,
            "browser_id": r.browser_id,
            "screen_resolution": r.screen_resolution,
            "action": r.action,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in records],
        "total": total,
        "page": page,
    }


@app.get("/api/admin/users/{user_id}/fingerprints")
async def admin_get_user_detail_fingerprints(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """管理员查看指定用户的全部指纹记录"""
    require_admin(request, db)
    records = db.query(IpFingerprint).filter(
        IpFingerprint.user_id == user_id,
    ).order_by(IpFingerprint.id.desc()).limit(100).all()
    target = db.query(User).filter(User.id == user_id).first()
    return {
        "user": user_to_dict(target) if target else None,
        "fingerprints": [{
            "id": r.id,
            "ip": r.ip,
            "geo": query_ip(r.ip),
            "user_agent": r.user_agent,
            "accept_language": r.accept_language,
            "screen_resolution": r.screen_resolution,
            "timezone": r.timezone,
            "platform": r.platform,
            "canvas_hash": r.canvas_hash,
            "fonts": r.fonts,
            "browser_id": r.browser_id,
            "action": r.action,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in records],
    }


@app.get("/api/admin/fingerprints/all")
async def admin_get_all_fingerprints(
    request: Request,
    db: Session = Depends(get_db),
):
    """管理员查看所有指纹（含匿名），支持 IP/用户搜索和分页"""
    admin = require_admin(request, db)
    search = (request.query_params.get("search") or "").strip()
    action_filter = (request.query_params.get("action") or "").strip()
    page = int(request.query_params.get("page", "1"))
    limit = int(request.query_params.get("limit", "50"))
    anonymous_only = request.query_params.get("anonymous", "").strip().lower() == "true"

    q = db.query(IpFingerprint)

    if anonymous_only:
        q = q.filter(IpFingerprint.user_id.is_(None))
    else:
        q = q.filter(IpFingerprint.user_id.isnot(None))

    if search:
        q = q.filter(
            sa_or(
                IpFingerprint.ip.ilike(f"%{search}%"),
                IpFingerprint.browser_id.ilike(f"%{search}%"),
                cast(IpFingerprint.user_id, SAString).ilike(f"%{search}%"),
            )
        )

    if action_filter:
        q = q.filter(IpFingerprint.action == action_filter)

    total = q.count()
    records = q.order_by(IpFingerprint.id.desc()).offset((page-1)*limit).limit(limit).all()

    # 批量查询用户信息
    user_ids = {r.user_id for r in records if r.user_id is not None}
    users_map = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(list(user_ids))).all()
        users_map = {u.id: {"username": u.username, "email": u.email, "role": u.role} for u in users}

    return {
        "fingerprints": [{
            "id": r.id,
            "user_id": r.user_id,
            "user": users_map.get(r.user_id),
            "ip": r.ip,
            "geo": query_ip(r.ip),
            "user_agent": (r.user_agent or "")[:300],
            "platform": r.platform,
            "browser_id": r.browser_id,
            "screen_resolution": r.screen_resolution,
            "canvas_hash": r.canvas_hash,
            "action": r.action,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in records],
        "total": total,
        "page": page,
        "anonymous_count": db.query(IpFingerprint).filter(IpFingerprint.user_id.is_(None)).count(),
        "user_count": db.query(IpFingerprint).filter(IpFingerprint.user_id.isnot(None)).count(),
    }


# ══════════════════════════════════════════════
# SUBDOMAIN API
# ══════════════════════════════════════════════

@app.get("/api/subdomains")
async def get_subdomains(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    subs = db.query(Subdomain).filter(Subdomain.user_id == user.id).all()
    return {"subdomains": [sub_to_dict(s) for s in subs]}

@app.post("/api/subdomains/check")
async def check_subdomain(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "check")
    body = await request.json()
    prefix = _validate_subdomain_prefix(body.get("prefix", ""))
    root_domain = body.get("root_domain", "").strip().lower()
    if not root_domain:
        raise HTTPException(400, detail="缺少根域名")
    fqdn = f"{prefix}.{root_domain}"
    existing = db.query(Subdomain).filter(Subdomain.fqdn == fqdn).first()
    reserved = _is_reserved_prefix(db, prefix)
    domain_info = next((d for d in get_system_domains(db, include_paused=False) if d["name"] == root_domain), None)
    if not domain_info:
        raise HTTPException(400, detail="根域名不可用")
    price_info = _registration_price(db, prefix, root_domain, domain_info)
    price = price_info["price"]
    if existing or reserved:
        return {"available": False, "price": price, **price_info}
    if await run_in_threadpool(_nicnames_prefix_taken, db, prefix, root_domain):
        return {"available": False, "price": price, "reason": "NicNames 已存在该前缀记录", **price_info}
    return {"available": True, "price": price, **price_info}

@app.post("/api/subdomains/register")
async def register_subdomain(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="请先登录")
    _rate_limit(request, "write", _request_actor(request, user))
    body = await request.json()
    prefix = _validate_subdomain_prefix(body.get("prefix", ""))
    root_domain = body.get("root_domain", "").strip().lower()
    if not root_domain:
        raise HTTPException(400, detail="缺少根域名")
    fqdn = f"{prefix}.{root_domain}"
    
    existing = db.query(Subdomain).filter(Subdomain.fqdn == fqdn).first()
    if existing:
        raise HTTPException(400, detail="域名已被注册")
    
    domain_info = next((d for d in get_system_domains(db, include_paused=False) if d["name"] == root_domain), None)
    if not domain_info:
        raise HTTPException(400, detail="根域名不可用")
    if _is_reserved_prefix(db, prefix):
        raise HTTPException(400, detail="该前缀为系统保留前缀，不能注册")
    price_info = _registration_price(db, prefix, root_domain, domain_info)
    price = price_info["price"]
    if await run_in_threadpool(_nicnames_prefix_taken, db, prefix, root_domain):
        raise HTTPException(400, detail="该前缀已在 NicNames 中存在，不能重复注册")
    
    if price <= 0:
        raise HTTPException(400, detail="域名价格配置异常，请联系管理员")
    if user.credits < price:
        raise HTTPException(400, detail="积分不足")
    
    register_ip = _default_register_ip(db)
    sub = Subdomain(user_id=user.id, domain_id=domain_info["id"], prefix=prefix, fqdn=fqdn, root_domain=root_domain)
    # 注册成功时默认把子域名 A 记录同步到本服务器，避免只写本地库、NicNames 官网无记录。
    _sync_nicnames_add(db, sub, "A", "@", register_ip, 14400)
    user.credits -= price
    db.add(sub)
    db.add(DNSRecord(subdomain=sub, type="A", name="@", content=register_ip, ttl=14400))
    sub.records_count = 1
    db.add(Transaction(user_id=user.id, type="deduct", amount=-price, balance=user.credits,
        description=f"认领域名 {fqdn}"))
    db.commit()
    db.refresh(sub)
    
    return {"subdomain": sub_to_dict(sub)}

@app.delete("/api/subdomains/{subdomain_id}")
async def delete_subdomain(subdomain_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    _rate_limit(request, "write", _request_actor(request, user))
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id, Subdomain.user_id == user.id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")

    # 用户主动释放域名：积分不退；释放前先删除 NicNames 真实 DNS 记录，避免本地删了但公网仍残留解析。
    records = db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).all()
    for record in records:
        _sync_nicnames_delete(db, sub, record.type, record.name, record.content)

    released_fqdn = sub.fqdn
    db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).delete()
    db.delete(sub)
    db.add(Transaction(user_id=user.id, type="release", amount=0, balance=user.credits,
        description=f"释放域名 {released_fqdn}（积分不退）"))
    db.commit()
    return {"success": True, "message": "域名已释放，积分不退"}

# ══════════════════════════════════════════════
# DNS RECORDS API
# ══════════════════════════════════════════════

@app.get("/api/subdomains/{subdomain_id}/records")
async def get_records(subdomain_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id, Subdomain.user_id == user.id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")
    records = db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).all()
    return {"records": [record_to_dict(r) for r in records]}

@app.post("/api/subdomains/{subdomain_id}/records")
async def create_record(subdomain_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    _rate_limit(request, "write", _request_actor(request, user))
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id, Subdomain.user_id == user.id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")
    current_count = db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).count()
    if current_count >= MAX_DNS_RECORDS_PER_SUBDOMAIN:
        raise HTTPException(400, detail=f"每个域名最多允许 {MAX_DNS_RECORDS_PER_SUBDOMAIN} 条 DNS 记录")
    body = await request.json()
    record_type, record_name, content, ttl = _validate_record_payload(
        body.get("type", ""),
        body.get("name", "@"),
        body.get("content", ""),
        body.get("ttl", 3600),
    )
    _sync_nicnames_add(db, sub, record_type, record_name, content, ttl)
    record = DNSRecord(
        subdomain_id=sub.id,
        type=record_type,
        name=record_name,
        content=content,
        ttl=ttl,
    )
    db.add(record)
    sub.records_count = current_count + 1
    db.commit()
    db.refresh(record)
    return {"record": record_to_dict(record)}

@app.put("/api/subdomains/{subdomain_id}/records/{record_id}")
async def update_record(subdomain_id: int, record_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    _rate_limit(request, "write", _request_actor(request, user))
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id, Subdomain.user_id == user.id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")
    record = db.query(DNSRecord).filter(DNSRecord.id == record_id, DNSRecord.subdomain_id == sub.id).first()
    if not record:
        raise HTTPException(404, detail="记录未找到")
    body = await request.json()
    new_type, new_name, new_content, new_ttl = _validate_record_payload(
        body.get("type", record.type),
        body.get("name", record.name),
        body.get("content", record.content),
        body.get("ttl", record.ttl),
    )
    old_type, old_name, old_content, old_ttl = record.type, record.name, record.content, record.ttl
    if (new_type, new_name, new_content, new_ttl) == (old_type, old_name, old_content, old_ttl):
        return {"record": record_to_dict(record)}

    # NicNames 暂无稳定的“修改”接口：用“删除旧记录 → 新增新记录”模拟修改。
    # 新增失败时尽力恢复旧记录，避免真实 DNS 与本地记录长期不一致。
    _sync_nicnames_delete(db, sub, old_type, old_name, old_content)
    try:
        _sync_nicnames_add(db, sub, new_type, new_name, new_content, new_ttl)
    except Exception:
        try:
            _sync_nicnames_add(db, sub, old_type, old_name, old_content, old_ttl)
        except Exception as restore_error:
            logger.warning("恢复旧 DNS 记录失败: %s", restore_error)
        raise

    record.type = new_type
    record.name = new_name
    record.content = new_content
    record.ttl = new_ttl
    db.commit()
    db.refresh(record)
    return {"record": record_to_dict(record)}


@app.delete("/api/subdomains/{subdomain_id}/records/{record_id}")
async def delete_record(subdomain_id: int, record_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    _rate_limit(request, "write", _request_actor(request, user))
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id, Subdomain.user_id == user.id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")
    record = db.query(DNSRecord).filter(DNSRecord.id == record_id, DNSRecord.subdomain_id == sub.id).first()
    if not record:
        raise HTTPException(404, detail="记录未找到")
    _sync_nicnames_delete(db, sub, record.type, record.name, record.content)
    db.delete(record)
    sub.records_count = max(0, db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).count() - 1)
    db.commit()
    return {"success": True}

# ══════════════════════════════════════════════
# CREDITS & ACTIVITY API
# ══════════════════════════════════════════════

@app.get("/api/credits/transactions")
async def get_transactions(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    txns = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.id.desc()).limit(100).all()
    return {"credits": user.credits, "transactions": [tx_to_dict(t) for t in txns]}

@app.post("/api/credits/redeem")
async def redeem_code(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    code = body.get("code", "").strip()
    config = db.query(SystemConfig).filter(SystemConfig.key == f"redeem_{code}").first()
    if not config:
        raise HTTPException(400, detail="无效的兑换码")
    amount = int(config.value)
    user.credits += amount
    db.delete(config)
    db.add(Transaction(user_id=user.id, type="grant", amount=amount, balance=user.credits,
        description=f"兑换码 {code}"))
    db.commit()
    return {"credits": user.credits}

@app.get("/api/activity")
async def get_activity(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    txns = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.id.desc()).limit(50).all()
    return {"activities": [{"id": t.id, "description": t.description, "amount": t.amount, "created_at": t.created_at.isoformat()} for t in txns]}

# ══════════════════════════════════════════════
# API KEYS API
# ══════════════════════════════════════════════

@app.get("/api/api-keys")
async def get_api_keys(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).all()
    return {"keys": [{"id": k.id, "name": k.name, "key": k.key, "created_at": k.created_at.isoformat()} for k in keys]}

@app.post("/api/api-keys")
async def create_api_key(request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    body = await request.json()
    key_str = "lc_" + secrets.token_hex(16)
    key = ApiKey(user_id=user.id, name=body.get("name", ""), key=key_str)
    db.add(key)
    db.commit()
    db.refresh(key)
    return {"key": {"id": key.id, "name": key.name, "key": key.key, "created_at": key.created_at.isoformat()}}

@app.delete("/api/api-keys/{key_id}")
async def delete_api_key(key_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_user_from_request(request, db)
    if not user:
        raise HTTPException(401, detail="未登录")
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(404, detail="Key 未找到")
    db.delete(key)
    db.commit()
    return {"success": True}

# ══════════════════════════════════════════════
# ADMIN API
# ══════════════════════════════════════════════

def require_admin(request: Request, db: Session):
    user = get_user_from_request(request, db)
    if not user or user.role != "admin":
        raise HTTPException(403, detail="需要管理员权限")
    _rate_limit(request, "admin", _request_actor(request, user))
    return user

def log_audit(admin_id: int, action: str, resource_type: str, resource_id: int = None, details: str = "", db: Session = None):
    if db:
        db.add(AuditLog(admin_id=admin_id, action=action, resource_type=resource_type,
            resource_id=resource_id, details=details))

@app.get("/api/admin/stats")
async def admin_stats(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    users_count = db.query(User).count()
    subs_count = db.query(Subdomain).count()
    records_count = db.query(DNSRecord).count()
    pending_mod = db.query(Moderation).filter(Moderation.status == "pending").count()
    from datetime import time
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_users = db.query(User).filter(User.created_at >= today_start).count()
    today_subdomains = db.query(Subdomain).filter(Subdomain.created_at >= today_start).count()
    today_records = db.query(DNSRecord).filter(DNSRecord.created_at >= today_start).count()
    # 未读通知数
    unread_notifications = db.query(Notification).filter(Notification.target == "all").count()
    return {
        "users": users_count, "subdomains": subs_count, "dns_records": records_count,
        "pending_moderation": pending_mod,
        "today_users": today_users, "today_subdomains": today_subdomains,
        "today_dns_records": today_records,
        "today_notifications": unread_notifications,
    }

@app.get("/api/admin/users")
async def admin_users(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    search = request.query_params.get("search", "")
    page = int(request.query_params.get("page", "1"))
    limit = 50
    q = db.query(User)
    if search:
        q = q.filter((User.username.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%")))
    total = q.count()
    users = q.order_by(User.id.desc()).offset((page-1)*limit).limit(limit).all()
    return {"users": [user_to_dict(u) for u in users], "total": total, "page": page}

@app.post("/api/admin/users/{user_id}/credits")
async def admin_grant_credits(user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    amount = int(body.get("amount", 0))
    description = body.get("description", "Admin grant")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    if target.credits is None:
        target.credits = 0
    target.credits += amount
    db.add(Transaction(user_id=target.id, type="admin_grant" if amount > 0 else "admin_deduct",
        amount=amount, balance=target.credits, description=description))
    log_audit(admin.id, "grant_credits", "user", user_id, f"{amount} credits: {description}", db)
    db.commit()
    return {"credits": target.credits}

@app.post("/api/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    if target.id == admin.id:
        raise HTTPException(400, detail="不能封禁自己")
    target.banned_at = datetime.now(timezone.utc)
    target.banned_reason = body.get("reason", "")
    log_audit(admin.id, "ban_user", "user", user_id, f"Reason: {target.banned_reason}", db)
    db.commit()
    return {"success": True}

@app.post("/api/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    target.banned_at = None
    target.banned_reason = None
    log_audit(admin.id, "unban_user", "user", user_id, "", db)
    db.commit()
    return {"success": True}

@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    if target.id == admin.id:
        raise HTTPException(400, detail="不能删除自己")
    # Cascade: delete transactions, api_keys, subdomains and their records
    db.execute(text("DELETE FROM transactions WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM api_keys WHERE user_id = :uid"), {"uid": user_id})
    sub_ids = [r[0] for r in db.execute(text("SELECT id FROM subdomains WHERE user_id = :uid"), {"uid": user_id}).fetchall()]
    if sub_ids:
        db.execute(text(f"DELETE FROM dns_records WHERE subdomain_id IN ({','.join(['?']*len(sub_ids))})"), sub_ids)
    db.execute(text("DELETE FROM subdomains WHERE user_id = :uid"), {"uid": user_id})
    # Also remove ip_fingerprints for this user
    db.execute(text("DELETE FROM ip_fingerprints WHERE user_id = :uid"), {"uid": user_id})
    # Delete audit logs referencing this user
    db.execute(text("DELETE FROM audit_logs WHERE resource_type = 'user' AND resource_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM audit_logs WHERE admin_id = :uid"), {"uid": user_id})
    db.delete(target)
    log_audit(admin.id, "delete_user", "user", user_id, f"Deleted user {target.username}", db)
    db.commit()
    return {"success": True}

@app.put("/api/admin/users/{user_id}/role")
async def admin_update_user_role(user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    role = body.get("role", "user")
    if role not in ("user", "admin"):
        raise HTTPException(400, detail="无效角色")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    target.role = role
    log_audit(admin.id, "update_role", "user", user_id, role, db)
    db.commit()
    return {"success": True, "user": user_to_dict(target)}

@app.post("/api/admin/users/bulk-grant-credits")
async def admin_bulk_grant_credits(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    reason = body.get("reason", "管理员批量发放")
    mode = body.get("mode", "per_user")  # "per_user" or "by_group"
    updated = 0

    if mode == "by_group":
        group_id = body.get("group_id")
        amount = int(body.get("amount", 0))
        if not group_id:
            raise HTTPException(400, detail="缺少用户组 ID")
        group = db.query(UserGroup).filter(UserGroup.id == group_id).first()
        if not group:
            raise HTTPException(404, detail="用户组不存在")
        targets = db.query(User).filter(User.group_id == group_id).all()
        for target in targets:
            if target.credits is None:
                target.credits = 0
            target.credits += amount
            db.add(Transaction(user_id=target.id, type="admin_grant" if amount > 0 else "admin_deduct",
                amount=amount, balance=target.credits, description=reason))
            updated += 1
        log_audit(admin.id, "bulk_grant_credits", "user_group", group_id, f"group={group.name} amount={amount} updated={updated}", db)
        # 自动创建后台通知
        if updated > 0:
            note_title = f"积分发放：{group.name}" if reason == "管理员批量发放" else f"积分发放：{reason}"
            note_content = f"向 {group.name}（{updated} 人）每人发放 {amount} 积分。备注：{reason}"
            db.add(Notification(title=note_title, content=note_content, type="grant",
                target="all", target_ids=""))
            db.add(AuditLog(admin_id=admin.id, action="auto_notify", resource_type="system",
                details=f"bulk_grant group={group.name} updated={updated}"))
    else:
        for item in body.get("amounts", []):
            target = db.query(User).filter(User.id == int(item.get("user_id", 0))).first()
            if not target:
                continue
            amount = int(item.get("amount", 0))
            if target.credits is None:
                target.credits = 0
            target.credits += amount
            db.add(Transaction(user_id=target.id, type="admin_grant" if amount > 0 else "admin_deduct",
                amount=amount, balance=target.credits, description=reason))
            updated += 1
        log_audit(admin.id, "bulk_grant_credits", "user", None, f"updated={updated}", db)
        # 自动创建后台通知
        if updated > 0:
            note_title = f"积分发放"
            note_content = f"向 {updated} 位用户发放积分。备注：{reason}"
            db.add(Notification(title=note_title, content=note_content, type="grant",
                target="all", target_ids=""))
            db.add(AuditLog(admin_id=admin.id, action="auto_notify", resource_type="system",
                details=f"bulk_grant per_user updated={updated}"))

    db.commit()
    return {"success": True, "updated": updated}

@app.post("/api/admin/redeem-codes")
async def admin_create_redeem_code(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    amount = int(body.get("amount", 0))
    count = int(body.get("count", 1))
    prefix = (body.get("prefix") or "DNS").strip().upper()

    if amount <= 0:
        raise HTTPException(400, detail="积分数量必须大于 0")
    if count <= 0 or count > 100:
        raise HTTPException(400, detail="生成数量需在 1-100 之间")
    if not prefix or len(prefix) > 10:
        raise HTTPException(400, detail="前缀长度 1-10 个字符")

    import secrets, string, time
    codes = []
    chars = string.ascii_uppercase + string.digits
    for i in range(count):
        while True:
            code = f"{prefix}-{''.join(secrets.choice(chars) for _ in range(8))}"
            existing = db.query(SystemConfig).filter(SystemConfig.key == f"redeem_{code}").first()
            if not existing:
                break
        db.add(SystemConfig(key=f"redeem_{code}", value=str(amount)))
        codes.append(code)
    log_audit(admin.id, "create_redeem_codes", "redeem", None,
              f"count={count}, amount={amount}, prefix={prefix}", db)
    db.commit()
    return {"codes": codes, "count": count, "amount": amount}

@app.get("/api/admin/subdomains")
async def admin_subdomains(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    search = request.query_params.get("search", "")
    q = db.query(Subdomain).join(User, Subdomain.user_id == User.id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Subdomain.fqdn.ilike(like)) |
            (Subdomain.root_domain.ilike(like)) |
            (User.username.ilike(like)) |
            (User.email.ilike(like))
        )
    subs = q.order_by(Subdomain.id.desc()).limit(100).all()
    return {"subdomains": [admin_subdomain_to_dict(s) for s in subs]}

@app.delete("/api/admin/subdomains/{subdomain_id}")
async def admin_release_subdomain(subdomain_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    sub = db.query(Subdomain).filter(Subdomain.id == subdomain_id).first()
    if not sub:
        raise HTTPException(404, detail="域名未找到")
    db.query(DNSRecord).filter(DNSRecord.subdomain_id == sub.id).delete()
    db.delete(sub)
    log_audit(admin.id, "release_subdomain", "subdomain", subdomain_id, f"{sub.fqdn}", db)
    db.commit()
    return {"success": True}

@app.get("/api/admin/dns-records")
async def admin_dns_records(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    search = (request.query_params.get("search") or "").strip()
    q = (
        db.query(DNSRecord, Subdomain, User)
        .join(Subdomain, DNSRecord.subdomain_id == Subdomain.id)
        .join(User, Subdomain.user_id == User.id)
    )
    if search:
        like = f"%{search}%"
        q = q.filter(sa_or(
            cast(DNSRecord.id, SAString).like(like),
            DNSRecord.type.like(like),
            DNSRecord.name.like(like),
            DNSRecord.content.like(like),
            Subdomain.prefix.like(like),
            Subdomain.fqdn.like(like),
            Subdomain.root_domain.like(like),
            User.username.like(like),
            User.email.like(like),
        ))
    rows = q.order_by(DNSRecord.id.desc()).limit(200).all()
    return {"records": [admin_record_to_dict(record, sub, owner) for record, sub, owner in rows]}

@app.delete("/api/admin/dns-records/{record_id}")
async def admin_delete_dns_record(record_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    record = db.query(DNSRecord).filter(DNSRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, detail="记录未找到")
    db.delete(record)
    log_audit(admin.id, "delete_dns_record", "dns_record", record_id, f"{record.type} {record.name}", db)
    db.commit()
    return {"success": True}

@app.get("/api/admin/system-domains")
async def admin_system_domains(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return {"domains": get_system_domains(db, include_paused=True)}

@app.post("/api/admin/system-domains")
async def admin_add_system_domain(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    domain = body.get("domain", "").strip().lower()
    if not domain or "." not in domain:
        raise HTTPException(400, detail="根域名无效")
    if any(d["name"] == domain for d in get_system_domains(db, include_paused=True)):
        raise HTTPException(400, detail="根域名已存在")
    db.add(SystemConfig(key=f"system_domain:{domain}", value=json.dumps({"credits": 10, "description": "管理员添加的根域名"}, ensure_ascii=False)))
    log_audit(admin.id, "add_system_domain", "system_domain", None, domain, db)
    db.commit()
    return {"success": True}

@app.delete("/api/admin/system-domains/{domain_id}")
async def admin_delete_system_domain(domain_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    domains = get_system_domains(db, include_paused=True)
    target = next((d for d in domains if d["id"] == domain_id), None)
    if not target:
        raise HTTPException(404, detail="根域名未找到")
    if target.get("source") == "nicnames":
        raise HTTPException(400, detail="NicNames 域名不能从本地删除，请到 NicNames 账号管理")
    cfg = db.query(SystemConfig).filter(SystemConfig.key == f"system_domain:{target['name']}").first()
    if cfg:
        db.delete(cfg)
    log_audit(admin.id, "delete_system_domain", "system_domain", domain_id, target["name"], db)
    db.commit()
    return {"success": True}

@app.put("/api/admin/system-domains/{domain_id}/distribution")
async def admin_update_domain_distribution(domain_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    domains = get_system_domains(db, include_paused=True)
    target = next((d for d in domains if d["id"] == domain_id), None)
    if not target:
        raise HTTPException(404, detail="根域名未找到")
    paused = bool(body.get("paused", False))
    reason = body.get("reason", "")
    meta = _set_domain_distribution(db, target["name"], paused, reason)
    log_audit(admin.id, "pause_domain_distribution" if paused else "resume_domain_distribution", "system_domain", domain_id, f"{target['name']} {reason}", db)
    db.commit()
    updated = {**target, **meta}
    return {"success": True, "domain": updated}

@app.get("/api/admin/audit-logs")
async def admin_audit_logs(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
    return {"logs": [{"id": l.id, "admin_id": l.admin_id, "action": l.action,
        "resource_type": l.resource_type, "resource_id": l.resource_id,
        "details": l.details, "created_at": l.created_at.isoformat()} for l in logs]}


def _cert_status_for_domain(domain: str) -> dict:
    domain = (domain or "").strip().lower()
    cert_dir = Path(__file__).parent.parent / "data" / "certs" / domain
    local_fullchain = cert_dir / "fullchain.pem"
    local_privkey = cert_dir / "privkey.pem"
    container = os.getenv("OPENRESTY_CONTAINER", "1Panel-openresty-GqXa")
    openresty_path = f"/usr/local/openresty/nginx/conf/ssl/{domain}/fullchain.pem"
    in_openresty = False
    try:
        res = subprocess.run(["docker", "exec", container, "test", "-f", openresty_path], timeout=8)
        in_openresty = res.returncode == 0
    except Exception:
        in_openresty = False
    acme_tool = ""
    for candidate in ("acme.sh", "certbot", "lego"):
        if subprocess.run(["sh", "-lc", f"command -v {candidate} >/dev/null 2>&1"], timeout=5).returncode == 0:
            acme_tool = candidate
            break
    return {
        "domain": domain,
        "names": [domain, f"*.{domain}"],
        "local_cert": local_fullchain.exists() and local_privkey.exists(),
        "openresty_cert": in_openresty,
        "openresty_path": f"/usr/local/openresty/nginx/conf/ssl/{domain}/",
        "issuer": "self-signed" if local_fullchain.exists() else None,
        "trusted_acme_available": bool(acme_tool),
        "acme_tool": acme_tool,
    }


def _provision_self_signed_wildcard_cert(domain: str) -> dict:
    domain = (domain or "").strip().lower()
    if not domain or "." not in domain:
        raise HTTPException(400, detail="根域名无效")
    cert_dir = Path(__file__).parent.parent / "data" / "certs" / domain
    cert_dir.mkdir(parents=True, exist_ok=True)
    key_path = cert_dir / "privkey.pem"
    crt_path = cert_dir / "fullchain.pem"
    cfg_path = cert_dir / "openssl-san.cnf"
    cfg_path.write_text(f"""
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn
[dn]
CN = {domain}
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = {domain}
DNS.2 = *.{domain}
""".strip() + "\n")
    subprocess.run([
        "openssl", "req", "-x509", "-nodes", "-days", "365", "-newkey", "rsa:2048",
        "-keyout", str(key_path), "-out", str(crt_path), "-config", str(cfg_path)
    ], check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    container = os.getenv("OPENRESTY_CONTAINER", "1Panel-openresty-GqXa")
    remote_dir = f"/usr/local/openresty/nginx/conf/ssl/{domain}"
    subprocess.run(["docker", "exec", container, "mkdir", "-p", remote_dir], check=True, timeout=15)
    subprocess.run(["docker", "cp", str(crt_path), f"{container}:{remote_dir}/fullchain.pem"], check=True, timeout=15)
    subprocess.run(["docker", "cp", str(key_path), f"{container}:{remote_dir}/privkey.pem"], check=True, timeout=15)
    return _cert_status_for_domain(domain)


@app.get("/api/admin/https/status")
async def admin_https_status(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    domains = get_system_domains(db, include_paused=True)
    return {"domains": [{**d, "https": _cert_status_for_domain(d["name"])} for d in domains]}


@app.post("/api/admin/system-domains/{domain_id}/https/provision")
async def admin_provision_domain_https(domain_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    domains = get_system_domains(db, include_paused=True)
    target = next((d for d in domains if d["id"] == domain_id), None)
    if not target:
        raise HTTPException(404, detail="根域名未找到")
    try:
        status = await run_in_threadpool(_provision_self_signed_wildcard_cert, target["name"])
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, detail=f"证书生成或复制失败：{e}")
    log_audit(admin.id, "provision_https", "system_domain", domain_id, target["name"], db)
    db.commit()
    return {"success": True, "https": status, "message": "已自动生成根域名+泛域名证书并复制到 OpenResty。当前为自签名证书；若安装 acme.sh/certbot 并完成 DNS-01，可替换为受信任证书。"}

@app.get("/api/admin/reserved-prefixes")
async def admin_reserved_prefixes(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    prefixes = db.query(ReservedPrefix).all()
    return {"prefixes": [{"id": p.id, "prefix": p.prefix, "created_at": p.created_at.isoformat()} for p in prefixes]}

@app.post("/api/admin/reserved-prefixes")
async def admin_add_reserved_prefix(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    prefix = _normalize_prefix(body.get("prefix", ""))
    if not prefix:
        raise HTTPException(400, detail="前缀不能为空")
    if prefix not in BUILTIN_RESERVED_PREFIXES and ("." in prefix or not prefix.replace('-', '').isalnum() or prefix.startswith('-') or prefix.endswith('-')):
        raise HTTPException(400, detail="前缀只能包含字母、数字和中划线，且不能以中划线开头或结尾")
    existing = db.query(ReservedPrefix).filter(ReservedPrefix.prefix == prefix).first()
    if existing:
        raise HTTPException(400, detail="前缀已存在")
    db.add(ReservedPrefix(prefix=prefix))
    log_audit(admin.id, "add_reserved_prefix", "reserved_prefix", 0, prefix, db)
    db.commit()
    return {"success": True}

@app.delete("/api/admin/reserved-prefixes/{prefix_id}")
async def admin_delete_reserved_prefix(prefix_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    p = db.query(ReservedPrefix).filter(ReservedPrefix.id == prefix_id).first()
    if not p:
        raise HTTPException(404, detail="前缀未找到")
    db.delete(p)
    db.commit()
    return {"success": True}

@app.get("/api/admin/premium-domains")
async def admin_premium_domains(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    domains = get_system_domains(db, include_paused=True)
    items = []
    for d in domains:
        configured = _get_config(db, f"domain_price:{d['name']}", "")
        if configured:
            try:
                price = int(configured)
            except Exception:
                price = d.get("credits", 10)
            items.append({
                "id": d.get("id"),
                "domain": d["name"],
                "price": max(int(price), 0),
                "source": d.get("source"),
                "configured": True,
            })
    return {"domains": items}


@app.post("/api/admin/premium-domains")
async def admin_set_premium_domain(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    domain = (body.get("domain") or body.get("root_domain") or "").strip().lower()
    if not domain or "." not in domain:
        raise HTTPException(400, detail="请输入有效根域名")
    try:
        price = int(body.get("price"))
    except Exception:
        raise HTTPException(400, detail="价格必须是整数积分")
    if price <= 0:
        raise HTTPException(400, detail="价格必须大于 0")
    available = any(d["name"] == domain for d in get_system_domains(db, include_paused=True))
    if not available:
        raise HTTPException(400, detail="该根域名不在当前可用域名列表中")
    _set_config(db, f"domain_price:{domain}", str(price))
    log_audit(admin.id, "set_premium_domain", "system_config", None, f"{domain}={price}", db)
    db.commit()
    return {"success": True}


@app.delete("/api/admin/premium-domains/{domain}")
async def admin_delete_premium_domain(domain: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    domain = domain.strip().lower()
    cfg = db.query(SystemConfig).filter(SystemConfig.key == f"domain_price:{domain}").first()
    if not cfg:
        raise HTTPException(404, detail="高级域名未找到")
    db.delete(cfg)
    log_audit(admin.id, "delete_premium_domain", "system_config", None, domain, db)
    db.commit()
    return {"success": True}


@app.get("/api/admin/premium-prefixes")
async def admin_premium_prefixes(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    prefixes = db.query(PremiumPrefix).all()
    return {"prefixes": [{"id": p.id, "prefix": p.prefix, "price_multiplier": p.price_multiplier,
        "created_at": p.created_at.isoformat()} for p in prefixes]}

@app.post("/api/admin/premium-prefixes")
async def admin_add_premium_prefix(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    prefix = body.get("prefix", "").strip().lower()
    multiplier = float(body.get("price_multiplier", 1.0))
    existing = db.query(PremiumPrefix).filter(PremiumPrefix.prefix == prefix).first()
    if existing:
        raise HTTPException(400, detail="前缀已存在")
    db.add(PremiumPrefix(prefix=prefix, price_multiplier=multiplier))
    db.commit()
    return {"success": True}

@app.delete("/api/admin/premium-prefixes/{prefix_id}")
async def admin_delete_premium_prefix(prefix_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    p = db.query(PremiumPrefix).filter(PremiumPrefix.id == prefix_id).first()
    if not p:
        raise HTTPException(404, detail="前缀未找到")
    db.delete(p)
    db.commit()
    return {"success": True}

@app.get("/api/admin/moderation")
async def admin_moderation(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    items = db.query(Moderation).order_by(Moderation.id.desc()).limit(100).all()
    return {"items": [{"id": m.id, "type": m.type, "reason": m.reason, "site_name": m.site_name,
        "site_url": m.site_url, "status": m.status, "created_at": m.created_at.isoformat()} for m in items]}


def _showcase_reason(description: str) -> str:
    return f"类型：站点展示申请\n说明：{description.strip()}"


def _showcase_default_avatar(db: Session | None = None) -> str:
    return _get_config(db, "showcase_default_avatar_url", "/site-logo.png")


def _showcase_payload(m: Moderation, db: Session | None = None) -> dict:
    return {
        "id": m.id,
        "type": m.type,
        "site_name": m.site_name,
        "site_url": m.site_url,
        "avatar_url": m.avatar_url or _showcase_default_avatar(db),
        "owner_name": m.owner_name or "@dns.ccocc",
        "reason": m.reason,
        "status": m.status,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _valid_optional_url(value: str, field_name: str) -> str:
    value = (value or "").strip()
    if value and (len(value) > 500 or not re.match(r"^https?://[^\s/$.?#].[^\s]*$", value, re.IGNORECASE)):
        raise HTTPException(400, detail=f"{field_name}必须是 http:// 或 https:// 开头的有效 URL")
    return value


def _normalize_owner_name(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "@dns.ccocc"
    if len(value) > 128:
        raise HTTPException(400, detail="所属用户名过长")
    return value if value.startswith("@") else f"@{value}"


def _validate_showcase_body(body: dict, partial: bool = False) -> dict:
    data = {}
    if not partial or "site_name" in body:
        site_name = (body.get("site_name") or body.get("name") or "").strip()
        if not site_name:
            raise HTTPException(400, detail="请填写站点名称")
        if len(site_name) > 128:
            raise HTTPException(400, detail="站点名称过长")
        data["site_name"] = site_name
    if not partial or "site_url" in body:
        site_url = (body.get("site_url") or body.get("url") or "").strip()
        if not site_url:
            raise HTTPException(400, detail="请填写站点 URL")
        if len(site_url) > 500:
            raise HTTPException(400, detail="站点 URL 过长")
        if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", site_url, re.IGNORECASE):
            raise HTTPException(400, detail="请填写 http:// 或 https:// 开头的有效 URL")
        data["site_url"] = site_url
    if not partial or "description" in body or "reason" in body:
        description = (body.get("description") or body.get("reason") or "").strip()
        if len(description) < 2:
            raise HTTPException(400, detail="请填写站点介绍")
        if len(description) > 2000:
            raise HTTPException(400, detail="站点介绍过长")
        data["reason"] = _showcase_reason(description)
    if not partial or "avatar_url" in body:
        data["avatar_url"] = _valid_optional_url(body.get("avatar_url", ""), "头像 URL")
    if not partial or "owner_name" in body or "username" in body:
        data["owner_name"] = _normalize_owner_name(body.get("owner_name") or body.get("username") or "")
    if "status" in body or not partial:
        status = (body.get("status") or "approved").strip()
        if status not in {"pending", "approved", "rejected"}:
            raise HTTPException(400, detail="状态无效")
        data["status"] = status
    return data


@app.get("/api/admin/showcase-sites")
async def admin_showcase_sites(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    items = db.query(Moderation).filter(Moderation.type == "showcase").order_by(Moderation.id.desc()).limit(300).all()
    return {"items": [_showcase_payload(m, db) for m in items]}


@app.post("/api/admin/showcase-sites")
async def admin_create_showcase_site(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    data = _validate_showcase_body(body, partial=False)
    item = Moderation(type="showcase", **data)
    db.add(item)
    db.flush()
    log_audit(admin.id, "create_showcase_site", "moderation", item.id, item.site_name or "", db)
    db.commit()
    db.refresh(item)
    return {"success": True, "item": _showcase_payload(item, db)}


@app.put("/api/admin/showcase-sites/{site_id}")
async def admin_update_showcase_site(site_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    item = db.query(Moderation).filter(Moderation.id == site_id, Moderation.type == "showcase").first()
    if not item:
        raise HTTPException(404, detail="站点展示不存在")
    body = await request.json()
    data = _validate_showcase_body(body, partial=True)
    for key, value in data.items():
        setattr(item, key, value)
    log_audit(admin.id, "update_showcase_site", "moderation", item.id, item.site_name or "", db)
    db.commit()
    db.refresh(item)
    return {"success": True, "item": _showcase_payload(item, db)}


@app.delete("/api/admin/showcase-sites/{site_id}")
async def admin_delete_showcase_site(site_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    item = db.query(Moderation).filter(Moderation.id == site_id, Moderation.type == "showcase").first()
    if not item:
        raise HTTPException(404, detail="站点展示不存在")
    name = item.site_name or item.site_url or str(item.id)
    db.delete(item)
    log_audit(admin.id, "delete_showcase_site", "moderation", site_id, name, db)
    db.commit()
    return {"success": True}

@app.post("/api/admin/moderation/{mod_id}")
async def admin_review_moderation(mod_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    action = body.get("action", "")  # approve or reject
    mod = db.query(Moderation).filter(Moderation.id == mod_id).first()
    if not mod:
        raise HTTPException(404, detail="未找到")
    if action == "approve":
        mod.status = "approved"
    elif action == "reject":
        mod.status = "rejected"
    else:
        raise HTTPException(400, detail="无效操作")
    mod.reviewed_by = admin.id
    db.commit()
    return {"success": True}

@app.get("/api/admin/notifications")
async def admin_notifications(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    items = db.query(Notification).order_by(Notification.id.desc()).limit(100).all()
    return {"notifications": [{"id": n.id, "title": n.title, "content": n.content, "type": n.type,
        "target": n.target, "target_ids": n.target_ids, "read_count": n.read_count,
        "created_at": n.created_at.isoformat() if n.created_at else None} for n in items]}

@app.post("/api/admin/notifications")
async def admin_create_notification(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(400, detail="标题不能为空")
    n = Notification(title=title, content=body.get("content", ""), type=body.get("type", "info"),
        target=body.get("target", "all"), target_ids=str(body.get("target_ids", "")))
    db.add(n)
    log_audit(admin.id, "create_notification", "notification", None, title, db)
    db.commit()
    return {"success": True}

@app.get("/api/admin/notifications/unread-count")
async def admin_unread_notification_count(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    count = db.query(Notification).filter(Notification.target == "all").count()
    return {"count": count}

@app.post("/api/admin/moderation/{mod_id}/approve")
async def admin_approve_moderation(mod_id: int, request: Request, db: Session = Depends(get_db)):
    request._json = {"action": "approve"}
    return await admin_review_moderation(mod_id, request, db)

@app.post("/api/admin/moderation/{mod_id}/reject")
async def admin_reject_moderation(mod_id: int, request: Request, db: Session = Depends(get_db)):
    request._json = {"action": "reject"}
    return await admin_review_moderation(mod_id, request, db)

@app.get("/api/admin/security")
async def admin_security_status(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    cfg = _security_config(db)
    now = time.time()
    active = []
    expired = []
    for ip, info in list(BLOCKED_IPS.items()):
        expires_at = float(info.get("expires_at") or 0)
        if expires_at and expires_at <= now:
            expired.append(ip)
            continue
        active.append({
            "ip": ip,
            "reason": info.get("reason", ""),
            "path": info.get("path", ""),
            "created_at": datetime.fromtimestamp(float(info.get("created_at") or now), timezone.utc).isoformat(),
            "expires_at": datetime.fromtimestamp(expires_at, timezone.utc).isoformat() if expires_at else None,
        })
    for ip in expired:
        BLOCKED_IPS.pop(ip, None)
    if expired:
        _save_blocked_ips()
    return {"config": cfg, "blocked_ips": active, "blocked_count": len(active)}

@app.delete("/api/admin/security/blocked-ips/{ip}")
async def admin_unblock_ip(ip: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if ip not in BLOCKED_IPS:
        raise HTTPException(404, detail="IP 不在封禁列表")
    BLOCKED_IPS.pop(ip, None)
    _save_blocked_ips()
    log_audit(admin.id, "unblock_ip", "security", None, ip, db)
    db.commit()
    return {"success": True}

@app.post("/api/admin/settings/test-email")
async def admin_test_email(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, detail="测试邮箱不能为空")
    code = f"{secrets.randbelow(1000000):06d}"
    _send_email(db, email, "DNS Portal 邮箱发送测试", f"这是一封 DNS Portal 邮箱发送测试邮件。测试验证码：{code}")
    return {"success": True, "message": "测试邮件已发送"}

@app.get("/api/admin/settings")
async def admin_settings(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    configs = db.query(SystemConfig).order_by(SystemConfig.key.asc()).all()
    return {"settings": [{"id": c.id, "key": c.key, "value": mask_config_value(c.key, c.value),
        "is_secret": mask_config_value(c.key, c.value) != c.value,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None} for c in configs]}

@app.post("/api/admin/settings")
@app.put("/api/admin/settings")
async def admin_update_settings(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    if "key" in body:
        items = {body.get("key"): body.get("value", "")}
    else:
        items = body
    for key, value in items.items():
        if not key:
            continue
        existing = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        # 密钥类配置在前端脱敏展示；保存批量快捷设置时留空表示保持原值，避免误清空 SMTP 授权码。
        if key in ("smtp_password", "nicnames_credentials", "github_client_secret", "linuxdo_client_secret") and (value is None or str(value).strip() == "" or str(value).strip() == "[已隐藏]") and existing:
            continue
        if existing:
            existing.value = str(value)
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(SystemConfig(key=key, value=str(value)))
        log_audit(admin.id, "update_setting", "system_config", None, str(key), db)
    db.commit()
    return {"success": True}

@app.delete("/api/admin/settings/{key}")
async def admin_delete_setting(key: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not cfg:
        raise HTTPException(404, detail="配置未找到")
    db.delete(cfg)
    log_audit(admin.id, "delete_setting", "system_config", None, key, db)
    db.commit()
    return {"success": True}

@app.get("/api/admin/groups")
async def admin_groups(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    groups = db.query(UserGroup).order_by(UserGroup.id).all()
    from sqlalchemy import func as sa_func
    result = []
    for g in groups:
        member_count = db.query(sa_func.count(User.id)).filter(User.group_id == g.id).scalar()
        result.append({
            "id": g.id, "name": g.name, "is_default": g.is_default,
            "member_count": member_count,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    return {"groups": result}

@app.post("/api/admin/groups")
async def admin_create_group(request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    name = (body.get("name", "") or "").strip()
    if not name:
        raise HTTPException(400, detail="组名不能为空")
    existing = db.query(UserGroup).filter(UserGroup.name == name).first()
    if existing:
        raise HTTPException(400, detail="组名已存在")
    g = UserGroup(name=name)
    db.add(g)
    db.commit()
    return {"success": True, "group": {"id": g.id, "name": g.name, "is_default": g.is_default,
        "member_count": 0, "created_at": g.created_at.isoformat() if g.created_at else None}}

@app.delete("/api/admin/groups/{group_id}")
async def admin_delete_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    g = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, detail="用户组未找到")
    if g.is_default:
        raise HTTPException(400, detail="不能删除默认用户组")
    members = db.query(User).filter(User.group_id == group_id).count()
    if members > 0:
        raise HTTPException(400, detail=f"该组还有 {members} 名成员，请先将其移至其他组")
    db.delete(g)
    log_audit(admin.id, "delete_group", "user_group", group_id, g.name, db)
    db.commit()
    return {"success": True}

@app.put("/api/admin/groups/{group_id}/name")
async def admin_rename_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    name = (body.get("name", "") or "").strip()
    if not name:
        raise HTTPException(400, detail="组名不能为空")
    existing = db.query(UserGroup).filter(UserGroup.name == name, UserGroup.id != group_id).first()
    if existing:
        raise HTTPException(400, detail="组名已存在")
    g = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, detail="用户组未找到")
    g.name = name
    log_audit(admin.id, "rename_group", "user_group", group_id, name, db)
    db.commit()
    return {"success": True}

@app.get("/api/admin/groups/{group_id}/members")
async def admin_group_members(group_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    g = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, detail="用户组未找到")
    members = db.query(User).filter(User.group_id == group_id).order_by(User.id).all()
    return {"members": [user_to_dict(u) for u in members], "group_name": g.name}

@app.post("/api/admin/groups/{group_id}/members")
async def admin_group_add_member(group_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    body = await request.json()
    g = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, detail="用户组未找到")
    user_id = body.get("user_id")
    if not user_id:
        raise HTTPException(400, detail="请提供 user_id")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    target.group_id = group_id
    log_audit(admin.id, "add_group_member", "user_group", group_id, f"Added user {target.username}({user_id})", db)
    db.commit()
    return {"success": True, "user": user_to_dict(target)}

@app.delete("/api/admin/groups/{group_id}/members/{user_id}")
async def admin_group_remove_member(group_id: int, user_id: int, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    g = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, detail="用户组未找到")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, detail="用户未找到")
    if target.group_id != group_id:
        raise HTTPException(400, detail="该用户不属于此组")
    target.group_id = None
    log_audit(admin.id, "remove_group_member", "user_group", group_id, f"Removed user {target.username}({user_id})", db)
    db.commit()
    return {"success": True}

# ══════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════

def user_to_dict(u: User):
    return {
        "id": u.id, "username": u.username, "email": u.email, "role": u.role,
        "credits": u.credits, "is_active": u.is_active, "whois_privacy": u.whois_privacy,
        "oidc_provider": u.oidc_provider, "oidc_avatar": u.oidc_avatar,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }

def sub_to_dict(s: Subdomain):
    return {
        "id": s.id, "user_id": s.user_id, "prefix": s.prefix, "fqdn": s.fqdn,
        "root_domain": s.root_domain, "records_count": s.records_count or 0,
        "status": s.status, "created_at": s.created_at.isoformat() if s.created_at else None,
        "domain": s.fqdn,
    }

def admin_subdomain_to_dict(s: Subdomain):
    data = sub_to_dict(s)
    owner = getattr(s, "owner", None)
    username = getattr(owner, "username", None)
    email = getattr(owner, "email", None)
    data.update({
        "owner_username": username,
        "owner_email": email,
        "username": username,
        "email": email,
        "registered_by": f"{username} <{email}>" if username and email else (username or email or str(s.user_id)),
    })
    return data

def record_to_dict(r: DNSRecord):
    return {
        "id": r.id, "subdomain_id": r.subdomain_id, "type": r.type, "name": r.name,
        "content": r.content, "ttl": r.ttl, "priority": r.priority,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }

def admin_record_to_dict(r: DNSRecord, sub: Subdomain, owner: User):
    data = record_to_dict(r)
    record_fqdn = sub.fqdn if r.name in ("@", "", None) else f"{r.name}.{sub.fqdn}"
    data.update({
        "subdomain_prefix": sub.prefix,
        "subdomain_fqdn": sub.fqdn,
        "root_domain": sub.root_domain,
        "record_fqdn": record_fqdn,
        "owner_username": owner.username if owner else None,
        "owner_email": owner.email if owner else None,
        "registered_by": f"{owner.username} <{owner.email}>" if owner and owner.username and owner.email else (owner.username if owner else None),
    })
    return data

def tx_to_dict(t: Transaction):
    return {
        "id": t.id, "type": t.type, "amount": t.amount, "balance": t.balance,
        "description": t.description, "created_at": t.created_at.isoformat() if t.created_at else None,
    }

def mask_config_value(key: str, value: str) -> str:
    sensitive_words = ("password", "token", "secret", "credential", "key")
    return "[已隐藏]" if any(word in (key or "").lower() for word in sensitive_words) else value

# ══════════════════════════════════════════════
# NICNAMES DNS API
# ══════════════════════════════════════════════

@app.get("/api/nicnames/config")
async def nicnames_get_config(request: Request, db: Session = Depends(get_db)):
    """检查 NicNames 凭据是否已配置（脱敏返回，仅管理员）"""
    require_admin(request, db)
    creds = load_credentials(db)
    if not creds:
        return {"configured": False}
    email = creds.get("email", "")
    # 脱敏显示
    masked = email[:3] + "***" + email[-4:] if len(email) > 7 else "***"
    return {
        "configured": True,
        "email": masked,
        "playwright_available": HAS_PLAYWRIGHT,
    }

@app.post("/api/nicnames/config")
async def nicnames_save_config(request: Request, db: Session = Depends(get_db)):
    """保存 NicNames 凭据（仅管理员）"""
    require_admin(request, db)
    body = await request.json()
    email = body.get("email", "").strip()
    password = body.get("password", "").strip()
    if not email or not password:
        raise HTTPException(400, detail="email 和 password 不能为空")
    save_credentials(db, email, password)
    db.commit()
    # 启动后台服务
    try:
        start_nicnames_background_services()
    except Exception as e:
        logger.warning(f"启动 NicNames 后台服务失败: {e}")
    return {"success": True, "message": "凭据已保存"}

@app.get("/api/nicnames/domains")
async def nicnames_domains(request: Request, db: Session = Depends(get_db)):
    """从 NicNames API 拉域名列表（仅管理员）"""
    require_admin(request, db)
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(400, detail="请先配置 NicNames 凭据")
    try:
        manager = NicNamesDNS(email=creds["email"], password=creds["password"])
        domains = await run_in_threadpool(manager.get_domains)
        return {"domains": domains}
    except Exception as e:
        raise HTTPException(500, detail=f"获取域名列表失败: {e}")

@app.get("/api/nicnames/domains/{domain}/records")
async def nicnames_dns_records(domain: str, request: Request, db: Session = Depends(get_db)):
    """拉 DNS 记录（仅管理员）"""
    require_admin(request, db)
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(400, detail="请先配置 NicNames 凭据")
    try:
        manager = NicNamesDNS(email=creds["email"], password=creds["password"])
        records = await run_in_threadpool(manager.get_dns_records, domain)
        return {"domain": domain, "records": records}
    except Exception as e:
        raise HTTPException(500, detail=f"获取 DNS 记录失败: {e}")

@app.post("/api/nicnames/domains/{domain}/records")
async def nicnames_add_record(domain: str, request: Request, db: Session = Depends(get_db)):
    """添加 DNS 记录（仅管理员）"""
    require_admin(request, db)
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(400, detail="请先配置 NicNames 凭据")
    body = await request.json()
    name = body.get("name", "@")
    record_type = body.get("type", "A")
    data = body.get("data", "")
    ttl = body.get("ttl", 14400)
    if not data:
        raise HTTPException(400, detail="data 不能为空")
    try:
        manager = NicNamesDNS(email=creds["email"], password=creds["password"])
        result = await run_in_threadpool(manager.add_dns_record, domain, name, record_type, data, ttl)
        if result:
            return {"success": True, "message": "记录已添加"}
        else:
            raise HTTPException(500, detail="添加记录失败")
    except Exception as e:
        raise HTTPException(500, detail=f"添加 DNS 记录失败: {e}")

@app.delete("/api/nicnames/domains/{domain_id}/records")
async def nicnames_delete_record(domain_id: str, request: Request, db: Session = Depends(get_db)):
    """删除 DNS 记录（使用 Playwright，仅管理员）"""
    require_admin(request, db)
    creds = load_credentials(db)
    if not creds:
        raise HTTPException(400, detail="请先配置 NicNames 凭据")
    body = await request.json()
    name = body.get("name", "")
    record_type = body.get("type", "")
    data = body.get("data", "")
    if not name or not record_type or not data:
        raise HTTPException(400, detail="name, type, data 不能为空")
    try:
        result = await run_in_threadpool(delete_dns_record_playwright, creds["email"], creds["password"], domain_id, name, record_type, data)
        if result:
            return {"success": True, "message": "记录已删除"}
        else:
            raise HTTPException(500, detail="删除记录失败")
    except Exception as e:
        raise HTTPException(500, detail=f"删除 DNS 记录失败: {e}")

# ══════════════════════════════════════════════
# SPA FALLBACK
# ══════════════════════════════════════════════

SPA_INDEX = STATIC_DIR / "index.html"

@app.middleware("http")
async def spa_fallback(request, call_next):
    path = request.url.path
    
    # Serve Vite public/ root static assets before SPA fallback
    allowed_static = {
        "favicon.ico",
        "apple-touch-icon.png",
        "site-logo.png",
        "og-cover.png",
        "robots.txt",
        "manifest.webmanifest",
    }
    filename = path.lstrip("/")
    if filename in allowed_static:
        file_path = STATIC_DIR / filename
        if file_path.exists() and file_path.is_file():
            mt, _ = mimetypes.guess_type(str(file_path))
            return FR(str(file_path), media_type=mt or "application/octet-stream")
    
    # Skip download paths
    if path.startswith("/download/"):
        return await call_next(request)
    response = await call_next(request)
    if response.status_code == 404:
        if not path.startswith("/api/") and not path.startswith("/auth/"):
            if SPA_INDEX.exists():
                return HTMLResponse(SPA_INDEX.read_text())
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.web:app", host=settings.host, port=settings.port, reload=settings.debug)
