"""NicNames DNS 管理模块 - 使用 API 加速版

API 端点分析结论:
  - GET  /1/dns/{domain}/record   -> DNS 记录列表 (JSON)  ✅
  - POST /1/dns/{domain}/record   -> 添加 DNS 记录       ✅
  - GET  /1/dns/{domain}/zone     -> 整个 Zone 文件        ✅
  - DELETE/PUT/...                -> 删除暂不支持 API     ❌ (使用 Playwright)

认证: Authorization: Bearer *** JWT 从 NextAuth session 获取

使用策略:
  1. 读取/添加 -> 直接用 API (秒级)
  2. 删除      -> 用 Playwright 操作浏览器 (点击 X -> 点 Save)
  3. Token     -> 后台线程自动刷新 (每 50 分钟)
  4. 浏览器     -> 常驻单例，不复每次启动
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

NICNAMES_SETTING_KEY = "nicnames_credentials"

# DNS 记录类型映射
DNS_TYPE_MAP = {
    "A": 1,
    "NS": 2,
    "CNAME": 5,
    "MX": 15,
    "TXT": 16,
    "AAAA": 28,
    "SRV": 33,
    "CAA": 257,
}
TYPE_NAME_MAP = {v: k for k, v in DNS_TYPE_MAP.items()}

# 尝试导入 Playwright
try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False


# ─────────── 凭据管理 ───────────

def save_credentials(db, email: str, password: str) -> None:
    """保存 NicNames 凭据到 SystemConfig 表"""
    from app.models import SystemConfig
    data = json.dumps({"email": email, "password": password})
    existing = db.query(SystemConfig).filter(SystemConfig.key == NICNAMES_SETTING_KEY).first()
    if existing:
        existing.value = data
    else:
        db.add(SystemConfig(key=NICNAMES_SETTING_KEY, value=data))
    logger.info("NicNames凭据已保存")


def load_credentials(db) -> dict | None:
    """从 SystemConfig 表读取 NicNames 凭据；配置损坏或脱敏占位时回退到安全默认配置。"""
    from app.models import SystemConfig

    def valid(creds: dict | None) -> dict | None:
        if not isinstance(creds, dict):
            return None
        email = str(creds.get("email") or "").strip()
        password = str(creds.get("password") or "").strip()
        if not email or not password or password in ("***", "[已隐藏]", "******"):
            return None
        return {"email": email, "password": password}

    config = db.query(SystemConfig).filter(SystemConfig.key == NICNAMES_SETTING_KEY).first()
    if config and config.value:
        try:
            creds = valid(json.loads(config.value))
            if creds:
                return creds
        except (json.JSONDecodeError, TypeError):
            logger.warning("NicNames 凭据配置不是有效 JSON，尝试回退到默认配置")

    try:
        from app.config import settings
        return valid({"email": settings.nicnames_email, "password": settings.nicnames_password})
    except Exception:
        return None


# ─────────── Token 管理 ───────────

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
TOKEN_FILE = os.path.join(DATA_DIR, 'nicnames_token.json')
TOKEN_CACHE: dict = {"token": None, "expires": 0}
_TOKEN_REFRESH_THREAD: threading.Thread | None = None
_TOKEN_REFRESH_STOP = threading.Event()


def _save_token_to_file(token: str):
    """持久化 token 到文件（重启后可用）"""
    try:
        data = {"token": token, "expires": time.time() + 3600}
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass


def _load_token_from_file() -> str | None:
    """从文件加载缓存的 token"""
    try:
        if os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE) as f:
                data = json.load(f)
            if data.get("expires", 0) > time.time() and data.get("token"):
                return data["token"]
    except Exception:
        pass
    return None


def _clear_token_cache() -> None:
    """清除内存/文件 token 缓存。NicNames API 返回 401 时必须强制重新登录获取。"""
    TOKEN_CACHE["token"] = None
    TOKEN_CACHE["expires"] = 0
    try:
        if os.path.exists(TOKEN_FILE):
            os.remove(TOKEN_FILE)
    except Exception:
        pass


# ─────────── 常驻浏览器单例 ───────────

class _BrowserManager:
    """常驻 Playwright 浏览器单例，复用登录会话加速删除操作"""

    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._email = None
        self._password = None
        self._logged_in = False

    @classmethod
    def get_instance(cls) -> "_BrowserManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = _BrowserManager()
        return cls._instance

    def start(self, email: str, password: str):
        """启动浏览器（首次或重启后调用）"""
        if not HAS_PLAYWRIGHT:
            logger.warning("Playwright 不可用，浏览器常驻模式关闭")
            return
        if self._browser:
            return  # 已启动
        self._email = email
        self._password = password
        try:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"],
            )
            self._context = self._browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            self._page = self._context.new_page()
            logger.info("常驻浏览器已启动")
            self._ensure_logged_in()
        except Exception as e:
            logger.error(f"常驻浏览器启动失败: {e}")
            self._cleanup()

    def _ensure_logged_in(self):
        """确保浏览器已登录 NicNames"""
        if self._logged_in:
            return
        if not self._page:
            return
        try:
            self._page.goto("https://nicnames.com/en/my", wait_until="domcontentloaded", timeout=15000)
            time.sleep(2)
            # 检查是否已登录（没有 Sign In 按钮说明已登录）
            sign_in = self._page.query_selector('button.btn:has-text("Sign In")')
            if not sign_in:
                self._logged_in = True
                logger.info("浏览器会话有效")
                return

            # 需要登录
            logger.info("浏览器需要重新登录")
            self._page.goto("https://nicnames.com/en/login", wait_until="domcontentloaded", timeout=15000)
            time.sleep(1)
            self._page.fill('input[name="email"]', self._email)
            self._page.fill('input[name="password"]', self._password)
            self._page.click('button.btn:has-text("Sign In")')
            time.sleep(3)
            self._logged_in = True
            logger.info("浏览器登录成功")
        except Exception as e:
            logger.warning(f"浏览器登录检查失败: {e}")

    def delete_record(self, domain_id: str, name: str, record_type: str, data: str) -> bool:
        """使用常驻浏览器删除 DNS 记录"""
        if not self._page:
            logger.error("常驻浏览器未启动")
            return False

        try:
            self._ensure_logged_in()
            dns_url = f"https://nicnames.com/en/my/domains/{domain_id}/dns"
            self._page.goto(dns_url, wait_until="domcontentloaded", timeout=20000)
            self._page.wait_for_load_state("networkidle", timeout=10000)
            time.sleep(2)

            # 找到并点击删除 X 图标
            deleted = self._page.evaluate(f"""() => {{
                const rows = document.querySelectorAll('tr');
                for (const row of rows) {{
                    const inputs = row.querySelectorAll('input');
                    let rowName = '', rowData = '';
                    for (const inp of inputs) {{
                        if (inp.name.endsWith('.name')) rowName = inp.value;
                        if (inp.name.endsWith('.addr') || inp.name.endsWith('.target')) rowData = inp.value;
                    }}
                    if (rowName === '{name}' && rowData === '{data}') {{
                        const xmark = row.querySelector('svg[data-icon="xmark"]');
                        if (xmark) {{
                            xmark.dispatchEvent(new MouseEvent('click', {{bubbles: true}}));
                            return true;
                        }}
                    }}
                }}
                return false;
            }}""")
            time.sleep(0.5)

            if not deleted:
                logger.warning(f"未找到匹配记录: {name} {record_type} {data}")
                return False

            # 点击 Save
            self._page.evaluate("""() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.textContent.trim() === 'Save' && !btn.disabled) {
                        btn.click(); return;
                    }
                }
            }""")
            time.sleep(3)
            logger.info(f"记录已删除: {name} {record_type} {data}")
            return True
        except Exception as e:
            logger.error(f"删除操作失败: {e}")
            # 标记可能需要重新登录
            self._logged_in = False
            return False

    def _cleanup(self):
        """清理浏览器资源"""
        try:
            if self._browser:
                self._browser.close()
        except Exception:
            pass
        try:
            if self._playwright:
                self._playwright.stop()
        except Exception:
            pass
        self._browser = None
        self._page = None
        self._context = None
        self._playwright = None
        self._logged_in = False

    def stop(self):
        """关闭浏览器"""
        self._cleanup()
        logger.info("常驻浏览器已关闭")

    @property
    def is_running(self) -> bool:
        return self._browser is not None


# ─────────── Token 获取 ───────────

def _get_bearer_token(email: str, password: str, force_refresh: bool = False) -> str | None:
    """使用 Playwright 登录并获取 Bearer token（仅在首次或过期时调用）"""
    # 默认先试文件缓存；401 重试时 force_refresh=True 会跳过缓存强制重新登录。
    if not force_refresh:
        cached = _load_token_from_file()
        if cached:
            TOKEN_CACHE["token"] = cached
            TOKEN_CACHE["expires"] = time.time() + 3600
            logger.info("Bearer token 来自文件缓存")
            return cached

    if not HAS_PLAYWRIGHT:
        raise RuntimeError("需要 Playwright")

    logger.info("正在通过 Playwright 获取 Bearer token...")
    token_result = {"token": None}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()

        # 先注册请求拦截再开始导航
        def on_request(request):
            url = request.url
            if "api.nicnames.com/1/" in url:
                auth_val = request.headers.get("authorization", "")
                if auth_val.startswith("Bearer ") and not token_result["token"]:
                    token_result["token"] = auth_val[7:]

        page.on("request", on_request)

        # 登录
        page.goto("https://nicnames.com/en/login", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_selector('input[name="email"]', timeout=5000)
        page.fill('input[name="email"]', email)
        page.fill('input[name="password"]', password)
        page.click('button.btn:has-text("Sign In")')
        time.sleep(3)

        # 导航到 dashboard 触发 API 调用。NicNames 前端有长轮询/慢请求，networkidle
        # 经常超时；token 已通过 request listener 抓取，不能因 networkidle 超时而失败。
        page.goto("https://nicnames.com/en/my", wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except PlaywrightTimeout:
            pass
        time.sleep(2)

        # 如果还没拿到 token，访问 domain 列表页
        if not token_result["token"]:
            page.goto("https://nicnames.com/en/my/domains/classic", wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_load_state("networkidle", timeout=6000)
            except PlaywrightTimeout:
                pass
            time.sleep(2)

        browser.close()

    token = token_result["token"]
    if token:
        TOKEN_CACHE["token"] = token
        TOKEN_CACHE["expires"] = time.time() + 3600
        _save_token_to_file(token)
        logger.info("Bearer token 获取成功（已持久化）")
    else:
        logger.error("无法获取 Bearer token")
    return token


def _ensure_token(email: str, password: str) -> str | None:
    """确保有有效的 token，过期则重新获取"""
    if TOKEN_CACHE["token"] and time.time() < TOKEN_CACHE["expires"]:
        return TOKEN_CACHE["token"]
    # 文件缓存
    cached = _load_token_from_file()
    if cached:
        TOKEN_CACHE["token"] = cached
        TOKEN_CACHE["expires"] = time.time() + 3600
        return cached
    return _get_bearer_token(email, password)


# ─────────── 后台 Token 刷新 ───────────

def _refresh_token_via_browser():
    """使用常驻浏览器刷新 token（无需重新登录）"""
    bg = _BrowserManager.get_instance()
    if not bg.is_running or not bg._page:
        logger.warning("常驻浏览器不可用，跳过 token 刷新")
        return None

    token_result = {"token": None}

    def on_request(request):
        url = request.url
        if "api.nicnames.com/1/" in url:
            auth_val = request.headers.get("authorization", "")
            if auth_val.startswith("Bearer ") and not token_result["token"]:
                token_result["token"] = auth_val[7:]

    bg._page.on("request", on_request)

    try:
        # 不重新登录，只访问 dashboard 页触发 API 调用获取新 token
        bg._page.goto("https://nicnames.com/en/my", wait_until="domcontentloaded", timeout=15000)
        bg._page.wait_for_load_state("networkidle", timeout=15000)
        time.sleep(2)

        if not token_result["token"]:
            bg._page.goto(
                "https://nicnames.com/en/my/domains/classic",
                wait_until="domcontentloaded", timeout=15000,
            )
            bg._page.wait_for_load_state("networkidle", timeout=15000)
            time.sleep(2)

        token = token_result["token"]
        if token:
            TOKEN_CACHE["token"] = token
            TOKEN_CACHE["expires"] = time.time() + 3600
            _save_token_to_file(token)
            return token
    except Exception as e:
        logger.warning(f"浏览器 token 刷新失败: {e}")
        # 标记浏览器可能需要重新登录
        bg._logged_in = False

    return None


def _token_refresh_loop():
    """后台线程：每 4 小时刷新 token（通过浏览器访问页面，不重新登录）"""
    logger.info("Token 后台刷新线程已启动（间隔 4h，无重复登录）")
    while not _TOKEN_REFRESH_STOP.is_set():
        _TOKEN_REFRESH_STOP.wait(4 * 60 * 60)  # 4 小时
        if _TOKEN_REFRESH_STOP.is_set():
            break

        try:
            # 优先用常驻浏览器刷新（无需重新登录）
            token = _refresh_token_via_browser()
            if token:
                logger.info("Token 后台静默刷新成功（无需登录）")
                continue

            # 浏览器不可用或刷新失败，回退：仅检查 token 文件是否仍有效
            from app.models import SessionLocal
            with SessionLocal() as session:
                creds = load_credentials(session)
            if not creds:
                continue

            # 先试文件缓存
            cached = _load_token_from_file()
            if cached:
                # 文件缓存仍然有效，更新内存缓存即可
                TOKEN_CACHE["token"] = cached
                TOKEN_CACHE["expires"] = time.time() + 3600
                logger.info("Token 刷新：使用文件缓存（免登录）")
                continue

            # 兜底：尝试用 API 调用检测 token 有效性，如果 401 才重新登录
            test_resp = requests.get(
                "https://api.nicnames.com/1/dashboard/statistics",
                headers={"Authorization": f"Bearer {cached or ''}", "Accept": "application/json"},
                timeout=10,
            )
            if test_resp.status_code == 401:
                # Token 真的失效了，需要重新登录获取
                logger.warning("Token 已失效，需要重新登录获取...")
                token = _get_bearer_token(creds["email"], creds["password"])
                if token:
                    logger.info("Token 重新获取成功")
            else:
                logger.info("Token 仍然有效，无需刷新")
        except Exception as e:
            logger.warning(f"Token 刷新异常: {e}")


def start_token_auto_refresh():
    """启动后台 token 自动刷新线程"""
    global _TOKEN_REFRESH_THREAD
    if _TOKEN_REFRESH_THREAD and _TOKEN_REFRESH_THREAD.is_alive():
        return
    _TOKEN_REFRESH_STOP.clear()
    _TOKEN_REFRESH_THREAD = threading.Thread(target=_token_refresh_loop, daemon=True)
    _TOKEN_REFRESH_THREAD.start()


def stop_token_auto_refresh():
    """停止后台 token 刷新线程"""
    _TOKEN_REFRESH_STOP.set()
    global _TOKEN_REFRESH_THREAD
    if _TOKEN_REFRESH_THREAD:
        _TOKEN_REFRESH_THREAD.join(timeout=5)
        _TOKEN_REFRESH_THREAD = None


# ─────────── API 调用 ───────────

API_BASE = "https://api.nicnames.com/1/dns"


def _api_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }


def get_domains_api(token: str) -> list[dict]:
    """通过 API 获取域名列表"""
    resp = requests.get(
        "https://api.nicnames.com/1/order/type/domain?pgn=1&pgl=50",
        headers=_api_headers(token),
        timeout=15,
    )
    if resp.status_code == 401:
        _clear_token_cache()
        raise RuntimeError("NicNames token 已失效")
    resp.raise_for_status()
    data = resp.json()

    domains = []
    for item in data.get("list", []):
        if isinstance(item, dict):
            domain_name = item.get("fqdn", "")
            domain_id = str(item.get("oid", ""))
            ets = item.get("ets", 0)
            expiry = ""
            if ets:
                import datetime
                expiry = datetime.datetime.fromtimestamp(ets).strftime("%Y-%m-%d")
            if domain_name:
                domains.append({
                    "name": domain_name,
                    "id": domain_id,
                    "expiry": expiry,
                })

    return domains


def get_dns_records_api(token: str, domain: str) -> list[dict]:
    """通过 API 获取 DNS 记录"""
    url = f"{API_BASE}/{domain}/record"
    resp = requests.get(url, headers=_api_headers(token), timeout=15)
    if resp.status_code == 401:
        _clear_token_cache()
        raise RuntimeError("NicNames token 已失效")
    resp.raise_for_status()
    data = resp.json()

    records = []
    for rr in data.get("rr", []):
        record = {
            "id": rr.get("id", ""),
            "name": rr.get("name", ""),
            "type": TYPE_NAME_MAP.get(rr.get("t"), f"TYPE{rr.get('t')}"),
            "type_code": rr.get("t"),
            "ttl": rr.get("ttl", 14400),
            "dclass": rr.get("dclass", 1),
        }
        if rr.get("t") == 1:  # A
            record["addr"] = rr.get("addr", "")
            record["data"] = rr.get("addr", "")
        elif rr.get("t") == 15:  # MX
            record["priority"] = rr.get("priority", 10)
            record["target"] = rr.get("target", "")
            record["data"] = f"{rr.get('priority', 10)} {rr.get('target', '')}"
        elif rr.get("t") == 5:  # CNAME
            record["target"] = rr.get("target", "")
            record["data"] = rr.get("target", "")
        elif rr.get("t") == 28:  # AAAA
            record["addr"] = rr.get("addr", "")
            record["data"] = rr.get("addr", "")
        elif rr.get("t") == 16:  # TXT
            record["txtdata"] = rr.get("txtdata", "")
            record["data"] = rr.get("txtdata", "")
        else:
            record["data"] = rr.get("data", "")

        records.append(record)

    return records


def add_dns_record_api(
    token: str, domain: str, name: str,
    record_type: str, data: str, ttl: int = 14400,
    priority: int | None = None,
) -> dict:
    """通过 API 添加 DNS 记录"""
    type_code = DNS_TYPE_MAP.get(record_type.upper(), 1)

    params = {
        "name": name,
        "t": str(type_code),
        "ttl": str(ttl),
        "dclass": "1",
    }

    if type_code == 1:  # A
        params["addr"] = data
    elif type_code == 15:  # MX
        params["priority"] = str(priority or 10)
        params["target"] = data
    elif type_code in (5,):  # CNAME
        params["target"] = data
    elif type_code == 28:  # AAAA
        params["addr"] = data
    elif type_code == 16:  # TXT
        params["txtdata"] = data
    else:
        params["addr"] = data

    url = f"{API_BASE}/{domain}/record"
    resp = requests.post(
        url,
        headers={**_api_headers(token), "Content-Type": "application/x-www-form-urlencoded"},
        data=params,
        timeout=15,
    )

    if resp.status_code == 401:
        _clear_token_cache()
        return {"success": False, "error": "unauthorized", "status_code": 401}

    if resp.status_code == 200:
        result = resp.json()
        record_id = result.get("id", "")
        logger.info(f"DNS 记录已添加: {name} {record_type} {data} (id={record_id})")
        return {"success": True, "id": record_id}
    else:
        error_msg = resp.text[:200]
        logger.warning(f"添加 DNS 记录失败 ({resp.status_code}): {error_msg}")
        return {"success": False, "error": error_msg, "status_code": resp.status_code}


def batch_add_records_api(token: str, records: list[dict]) -> list[dict]:
    """批量添加 DNS 记录"""
    results = []
    for record in records:
        domain = record.get("domain", "")
        name = record.get("name", "@")
        rtype = record.get("type", "A")
        data = record.get("data", "")
        ttl = record.get("ttl", 14400)

        result = add_dns_record_api(token, domain, name, rtype, data, ttl)
        results.append({
            "domain": domain,
            "name": name,
            "type": rtype,
            "data": data,
            "status": "success" if result.get("success") else "failed",
            "message": result.get("error", ""),
        })

    return results


# ─────────── Playwright 删除 ───────────

def delete_dns_record_playwright(
    email: str, password: str, domain_id: str,
    name: str, record_type: str, data: str,
) -> bool:
    """删除 DNS 记录（优先使用常驻浏览器，回退到临时浏览器）"""
    # 优先用常驻浏览器
    bg = _BrowserManager.get_instance()
    if bg.is_running:
        logger.info("使用常驻浏览器删除记录")
        return bg.delete_record(domain_id, name, record_type, data)

    # 回退：启动临时浏览器
    if not HAS_PLAYWRIGHT:
        raise RuntimeError("需要 Playwright")

    logger.info("常驻浏览器不可用，启动临时浏览器...")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto("https://nicnames.com/en/login", wait_until="domcontentloaded", timeout=15000)
        time.sleep(1)
        page.fill('input[name="email"]', email)
        page.fill('input[name="password"]', password)
        page.click('button.btn:has-text("Sign In")')
        time.sleep(5)

        dns_url = f"https://nicnames.com/en/my/domains/{domain_id}/dns"
        page.goto(dns_url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_load_state("networkidle", timeout=10000)
        time.sleep(2)

        deleted = page.evaluate(f"""() => {{
            const rows = document.querySelectorAll('tr');
            for (const row of rows) {{
                const inputs = row.querySelectorAll('input');
                let rowName = '', rowData = '';
                for (const inp of inputs) {{
                    if (inp.name.endsWith('.name')) rowName = inp.value;
                    if (inp.name.endsWith('.addr') || inp.name.endsWith('.target')) rowData = inp.value;
                }}
                if (rowName === '{name}' && rowData === '{data}') {{
                    const xmark = row.querySelector('svg[data-icon="xmark"]');
                    if (xmark) {{
                        xmark.dispatchEvent(new MouseEvent('click', {{bubbles: true}}));
                        return true;
                    }}
                }}
            }}
            return false;
        }}""")
        time.sleep(0.5)

        if not deleted:
            browser.close()
            return False

        page.evaluate("""() => {
            const btns = document.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.textContent.trim() === 'Save' && !btn.disabled) {
                    btn.click(); return;
                }
            }
        }""")
        time.sleep(3)
        browser.close()
        return True


# ─────────── 统一管理器 ───────────

class NicNamesDNS:
    """NicNames DNS 管理器 - API + Playwright 混合方案"""

    def __init__(self, email: str = "", password: str = ""):
        self.email = email
        self.password = password
        self._token = None

    @classmethod
    def from_db(cls, db_session) -> "NicNamesDNS":
        creds = load_credentials(db_session)
        if not creds:
            raise ValueError("未配置 NicNames 凭据")
        return cls(email=creds["email"], password=creds["password"])

    def ensure_token(self, force_refresh: bool = False) -> str:
        if force_refresh:
            _clear_token_cache()
            self._token = _get_bearer_token(self.email, self.password, force_refresh=True)
        elif not self._token or time.time() > TOKEN_CACHE.get("expires", 0):
            self._token = _ensure_token(self.email, self.password)
        if not self._token:
            raise RuntimeError("无法获取 NicNames token，请检查凭据或登录状态")
        TOKEN_CACHE["token"] = self._token
        TOKEN_CACHE["expires"] = time.time() + 3600
        return self._token

    def get_domains(self) -> list[dict]:
        token = self.ensure_token()
        try:
            return get_domains_api(token)
        except RuntimeError as e:
            if "token" not in str(e).lower():
                raise
            token = self.ensure_token(force_refresh=True)
            return get_domains_api(token)

    def get_dns_records(self, domain: str) -> list[dict]:
        token = self.ensure_token()
        try:
            return get_dns_records_api(token, domain)
        except RuntimeError as e:
            if "token" not in str(e).lower():
                raise
            token = self.ensure_token(force_refresh=True)
            return get_dns_records_api(token, domain)

    def add_dns_record(self, domain: str, name: str, record_type: str, data: str, ttl: int = 14400) -> bool:
        token = self.ensure_token()
        result = add_dns_record_api(token, domain, name, record_type, data, ttl)
        if result.get("status_code") == 401:
            token = _get_bearer_token(self.email, self.password)
            if token:
                self._token = token
                result = add_dns_record_api(token, domain, name, record_type, data, ttl)
        return result.get("success", False)

    def batch_add_records(self, records: list[dict]) -> list[dict]:
        token = self.ensure_token()
        return batch_add_records_api(token, records)

    def delete_dns_record(self, domain_id: str, name: str, record_type: str, data: str) -> bool:
        return delete_dns_record_playwright(self.email, self.password, domain_id, name, record_type, data)

    def resolve_domain_id(self, domain_name: str) -> str | None:
        domains = self.get_domains()
        for d in domains:
            if d["name"] == domain_name:
                return d["id"]
        return None

    def record_exists(self, domain: str, name: str, record_type: str, data: str) -> bool:
        records = self.get_dns_records(domain)
        for r in records:
            clean_name = r["name"].replace(f".{domain}.", "").replace(f".{domain}", "")
            if clean_name == name and r["type"] == record_type and r["data"] == data:
                return True
        return False

    @staticmethod
    def check_playwright() -> tuple[bool, str]:
        return (True, "Playwright 可用") if HAS_PLAYWRIGHT else (False, "缺少 playwright")


# ─────────── 后台服务生命周期 ───────────

_BG_BROWSER_STARTED = False


def start_nicnames_background_services():
    """启动 NicNames 后台服务（token 刷新 + 常驻浏览器）
    在应用启动时调用一次即可"""
    global _BG_BROWSER_STARTED
    if _BG_BROWSER_STARTED:
        return

    # 启动 token 自动刷新
    start_token_auto_refresh()

    # 延迟启动常驻浏览器（避免阻塞应用启动）
    def _lazy_start_browser():
        time.sleep(5)  # 等应用完全启动
        try:
            from app.models import SessionLocal
            with SessionLocal() as session:
                creds = load_credentials(session)
            if creds:
                bg = _BrowserManager.get_instance()
                bg.start(creds["email"], creds["password"])
        except Exception as e:
            logger.warning(f"常驻浏览器延迟启动失败: {e}")

    t = threading.Thread(target=_lazy_start_browser, daemon=True)
    t.start()

    _BG_BROWSER_STARTED = True
    logger.info("NicNames 后台服务已启动（token 刷新 + 常驻浏览器）")


def stop_nicnames_background_services():
    """停止 NicNames 后台服务"""
    stop_token_auto_refresh()
    bg = _BrowserManager.get_instance()
    bg.stop()
    global _BG_BROWSER_STARTED
    _BG_BROWSER_STARTED = False
    logger.info("NicNames 后台服务已停止")
