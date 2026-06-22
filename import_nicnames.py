"""直接从 NicNames API 拉域名数据导入 DNS Portal"""
import sys, os, json, sqlite3, requests, time, hashlib

EMAIL = "REDACTED@example.com"
PASSWORD = "REDACTED"
API_BASE = "https://api.nicnames.com/1/dns"
DB_PATH = '/opt/data/apps/dnsportal/data/dnsportal.db'
TOKEN_FILE = '/opt/data/apps/tg-monitor/data/nicnames_token.json'

TYPE_NAME_MAP = {1: 'A', 2: 'NS', 5: 'CNAME', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 257: 'CAA'}

def get_token():
    # 先试文件缓存
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            data = json.load(f)
        if data.get('expires', 0) > time.time() and data.get('token'):
            print("✓ Token 来自文件缓存")
            return data['token']
    
    # 用 Playwright 获取 token
    print("正在通过 Playwright 获取 Bearer token...")
    from playwright.sync_api import sync_playwright
    token_result = {"token": None}
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
        
        def on_request(request):
            url = request.url
            if "api.nicnames.com/1/" in url:
                auth_val = request.headers.get("authorization", "")
                if auth_val.startswith("Bearer ") and not token_result["token"]:
                    token_result["token"] = auth_val[7:]
        
        page.on("request", on_request)
        page.goto("https://nicnames.com/en/login", wait_until="domcontentloaded", timeout=20000)
        page.fill('input[name="email"]', EMAIL)
        page.fill('input[name="password"]', PASSWORD)
        page.click('button.btn:has-text("Sign In")')
        time.sleep(3)
        page.goto("https://nicnames.com/en/my", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_load_state("networkidle", timeout=15000)
        time.sleep(2)
        
        if not token_result["token"]:
            page.goto("https://nicnames.com/en/my/domains/classic", wait_until="domcontentloaded", timeout=15000)
            page.wait_for_load_state("networkidle", timeout=15000)
            time.sleep(2)
        
        browser.close()
    
    token = token_result["token"]
    if token:
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'w') as f:
            json.dump({"token": token, "expires": time.time() + 3600}, f)
        print("✓ Bearer token 获取成功")
    else:
        print("✗ 无法获取 Bearer token")
    return token

def get_dns_records(token, domain_name):
    """获取某个域名的 DNS 记录（用域名名而不是ID）"""
    resp = requests.get(
        f"{API_BASE}/{domain_name}/record",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    rr = data.get('rr', [])
    result = []
    for r in rr:
        type_num = r.get('t', 1)
        type_name = TYPE_NAME_MAP.get(type_num, 'A')
        name = r.get('name', domain_name + '.').rstrip('.')
        # 去除末尾的 .domain.com.
        if name.endswith('.' + domain_name + '.'):
            name = name[:-(len(domain_name)+2)]
        elif name == domain_name + '.':
            name = '@'
        
        value = r.get('addr') or r.get('target') or ''
        ttl = r.get('ttl', 600)
        result.append({'name': name, 'type': type_name, 'value': value, 'ttl': ttl})
    return result

def get_domains(token):
    """获取域名列表"""
    resp = requests.get(
        "https://api.nicnames.com/1/order/type/domain?pgn=1&pgl=50",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    domains = []
    for item in data.get("list", []):
        if isinstance(item, dict):
            name = item.get("fqdn", "")
            did = str(item.get("oid", ""))
            ets = item.get("ets", 0)
            expiry = ""
            if ets:
                import datetime
                expiry = datetime.datetime.fromtimestamp(ets).strftime("%Y-%m-%d")
            if name:
                domains.append({"name": name, "id": did, "expiry": expiry})
    return domains

# ====== 主流程 ======

# 1. Token
print("=" * 50)
print("第1步: 获取 NicNames Token")
print("=" * 50)
token = get_token()
if not token:
    sys.exit(1)

# 2. 域名列表
print("\n" + "=" * 50)
print("第2步: 获取域名列表")
print("=" * 50)
domains = get_domains(token)
for d in domains:
    print(f"  [{d['id']}] {d['name']} (过期: {d.get('expiry', 'N/A')})")
print(f"\n共 {len(domains)} 个域名")

# 3. DNS 记录
print("\n" + "=" * 50)
print("第3步: 获取 DNS 记录")
print("=" * 50)
domain_records = {}
for d in domains:
    name = d['name']
    records = get_dns_records(token, name)
    domain_records[name] = records
    print(f"  ✓ {name}: {len(records)} 条记录")

total_records = sum(len(v) for v in domain_records.values())
print(f"\n总计: {len(domains)} 个域名, {total_records} 条 DNS 记录")

# 4. 导入 SQLite
print("\n" + "=" * 50)
print("第4步: 导入 DNS Portal SQLite")
print("=" * 50)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 看表存在
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print(f"  现有表: {tables}")

# admin
cur.execute("SELECT id FROM users WHERE username = 'admin'")
row = cur.fetchone()
if not row:
    pw_hash = hashlib.sha256('REDACTED_ADMIN_PASSWORD'.encode()).hexdigest()
    cur.execute(
        "INSERT INTO users (username, email, password_hash, role, credits, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
        ('admin', 'admin@REDACTED.example.com', pw_hash, 'admin', 999999, 1)
    )
    conn.commit()
    admin_id = cur.lastrowid
    print(f"✓ 创建 admin 用户 (ID: {admin_id})")
else:
    admin_id = row[0]
    print(f"✓ admin 用户已存在 (ID: {admin_id})")

# 清空旧数据
cur.execute("DELETE FROM dns_records")
cur.execute("DELETE FROM subdomains")
conn.commit()
print("  ✓ 已清空旧数据")

# 导入
import_count = 0
for d in domains:
    name = d['name']
    prefix = name.split('.')[0]
    domain_root = '.'.join(name.split('.')[-2:])  # e.g. ccocc.cyou
    
    cur.execute(
        "INSERT INTO subdomains (user_id, domain_id, prefix, fqdn, root_domain) VALUES (?, ?, ?, ?, ?)",
        (admin_id, d['id'], prefix, name, domain_root)
    )
    sub_id = cur.lastrowid
    
    records = domain_records.get(name, [])
    for r in records:
        cur.execute(
            "INSERT INTO dns_records (subdomain_id, name, type, content, ttl) VALUES (?, ?, ?, ?, ?)",
            (sub_id, r['name'], r['type'], r['value'], r['ttl'])
        )
        import_count += 1
    
    print(f"  → {name}: {len(records)} 条记录")

conn.commit()
conn.close()
print(f"\n✅ 完成! {len(domains)} 个域名, {import_count} 条 DNS 记录")
print("刷新 REDACTED 站点即可看到真实数据")
