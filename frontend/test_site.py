"""Test the ReactBits DNS site end-to-end via curl"""
import json
import urllib.request
import re

BASE = 'http://localhost:8097'

def test(path, desc):
    try:
        r = urllib.request.urlopen(f'{BASE}{path}', timeout=10)
        body = r.read().decode()
        status = r.status
        if status == 200:
            print(f'✅ {desc} — 200 OK ({len(body)} bytes)')
        else:
            print(f'❌ {desc} — {status}')
        return body
    except Exception as e:
        print(f'❌ {desc} — {e}')
        return ''

print("=" * 50)
print("ReactBits DNS · 功能测试")
print("=" * 50)

# 1. Static files
html = test('/', '首页 HTML')
if 'ReactBits DNS' in html:
    print('  ✅ 首页标题正确')
if 'interactive' not in html:  # should have our custom content
    pass

# 2. JS bundle
test('/assets/index-DyIuZRtH.js', 'JS 文件')
test('/assets/index-kYGu_rKs.css', 'CSS 文件')

# 3. SPA fallback
test('/console', 'SPA 路由 /console')
test('/console/domains', 'SPA 路由 /console/domains')

# 4. API endpoints
print("\n--- API 测试 ---")
try:
    r = urllib.request.urlopen(f'{BASE}/api/domains', timeout=10)
    data = json.loads(r.read())
    domains = data.get('domains', [])
    print(f'✅ GET /api/domains — {len(domains)} 个域名')
    for d in domains:
        print(f'   🌐 {d["name"]} ({d["credits"]} 积分)')
except Exception as e:
    print(f'❌ GET /api/domains — {e}')

# 5. Auth config
try:
    r = urllib.request.urlopen(f'{BASE}/api/public/auth-config', timeout=10)
    data = json.loads(r.read())
    print(f'✅ GET /api/public/auth-config — OIDC: {data.get("oidc_enabled")}, 注册: {data.get("signup_enabled")}')
except Exception as e:
    print(f'❌ GET /api/public/auth-config — {e}')

# 6. SPA catch-all
try:
    r = urllib.request.urlopen(f'{BASE}/some/random/path', timeout=10)
    if 'ReactBits' in r.read().decode():
        print(f'✅ SPA fallback — 返回首页 HTML')
except Exception as e:
    print(f'❌ SPA fallback — {e}')

print("\n" + "=" * 50)
print("功能验证完成")
