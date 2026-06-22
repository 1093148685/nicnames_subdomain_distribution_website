"""轻量 IP 地理定位查询（无外部依赖）"""
import ipaddress
import json
import os
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
IP_CACHE_FILE = DATA_DIR / "ip_geo_cache.json"

# 内存缓存
_ip_cache: dict[str, dict] = {}

# 中国省份城市正则（快速本地判断国内 IP）
CN_IP_RANGES: list[tuple[ipaddress.IPv4Network, str]] = []


def _load_cn_ranges():
    """从内置数据加载中国 IP 段映射到省份"""
    if CN_IP_RANGES:
        return
    # 简化的主要运营商 IP 段 → 省份映射
    data = [
        # 电信
        ("1.0.0.0/8", "中国"), ("14.0.0.0/8", "中国"), ("27.0.0.0/8", "中国"),
        ("36.0.0.0/8", "中国"), ("39.0.0.0/8", "中国"), ("42.0.0.0/8", "中国"),
        ("49.0.0.0/8", "中国"), ("58.0.0.0/8", "中国"), ("59.0.0.0/8", "中国"),
        ("60.0.0.0/8", "中国"), ("61.0.0.0/8", "中国"), ("101.0.0.0/8", "中国"),
        ("103.0.0.0/8", "中国"), ("106.0.0.0/8", "中国"), ("110.0.0.0/8", "中国"),
        ("111.0.0.0/8", "中国"), ("112.0.0.0/8", "中国"), ("113.0.0.0/8", "中国"),
        ("114.0.0.0/8", "中国"), ("115.0.0.0/8", "中国"), ("116.0.0.0/8", "中国"),
        ("117.0.0.0/8", "中国"), ("118.0.0.0/8", "中国"), ("119.0.0.0/8", "中国"),
        ("120.0.0.0/8", "中国"), ("121.0.0.0/8", "中国"), ("122.0.0.0/8", "中国"),
        ("123.0.0.0/8", "中国"), ("124.0.0.0/8", "中国"), ("125.0.0.0/8", "中国"),
        ("175.0.0.0/8", "中国"), ("180.0.0.0/8", "中国"), ("182.0.0.0/8", "中国"),
        ("183.0.0.0/8", "中国"), ("202.0.0.0/8", "中国"), ("210.0.0.0/8", "中国"),
        ("211.0.0.0/8", "中国"), ("218.0.0.0/8", "中国"), ("219.0.0.0/8", "中国"),
        ("220.0.0.0/8", "中国"), ("221.0.0.0/8", "中国"), ("222.0.0.0/8", "中国"),
        ("223.0.0.0/8", "中国"),
    ]
    for cidr, label in data:
        try:
            CN_IP_RANGES.append((ipaddress.ip_network(cidr), label))
        except Exception:
            pass


def _load_cache():
    global _ip_cache
    try:
        if IP_CACHE_FILE.exists():
            data = json.loads(IP_CACHE_FILE.read_text())
            if isinstance(data, dict):
                _ip_cache = data
    except Exception:
        _ip_cache = {}


def _save_cache():
    try:
        # 只保留最近 2000 条
        trimmed = dict(list(_ip_cache.items())[-2000:])
        IP_CACHE_FILE.write_text(json.dumps(trimmed, ensure_ascii=False, indent=2))
    except Exception:
        pass


def query_ip(ip: str) -> str:
    """查询 IP 地理位置，返回如 '中国·广东·广州' 或 '日本·东京' 或 '美国·加利福尼亚·洛杉矶'"""
    # 私网地址
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private:
            return "内网"
        if addr.is_loopback:
            return "本机"
    except Exception:
        return ip[:30]

    _load_cache()
    if ip in _ip_cache:
        return _ip_cache[ip]

    _load_cn_ranges()
    geo = _query_online(ip)

    _ip_cache[ip] = geo
    _save_cache()
    return geo


def _query_online(ip: str) -> str:
    """在线查 ip-api.com 获取地区（免费版，无 API key，支持中文）"""
    import urllib.request
    try:
        req = urllib.request.Request(
            f"http://ip-api.com/json/{ip}?lang=zh-CN&fields=country,regionName,city,query",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())

        country = (data.get("country") or "").strip()
        region = (data.get("regionName") or "").strip()
        city = (data.get("city") or "").strip()

        parts = []
        if country:
            parts.append(country)
        if region and region != country:
            parts.append(region)
        if city and city != region and city != country:
            parts.append(city)

        if country == "中国" and not region and not city:
            return "中国"
        if not parts:
            return ip[:30]
        return "·".join(parts)
    except Exception:
        pass

    # 在线失败，回退本地判断中国
    _load_cn_ranges()
    for net, label in CN_IP_RANGES:
        try:
            if ipaddress.ip_address(ip) in net:
                return "中国·境内"
        except Exception:
            pass
    return ip[:30]


def batch_query(ips: list[str]) -> dict[str, str]:
    """批量查询，返回 {ip: geo}"""
    _load_cache()
    result = {}
    uncached = []
    for ip in ips:
        if ip in _ip_cache:
            result[ip] = _ip_cache[ip]
        else:
            uncached.append(ip)

    # 批量查在线的只查第一个，避免触发频率限制
    if uncached:
        geo = _query_online(uncached[0])
        for ip in uncached:
            result[ip] = geo
            _ip_cache[ip] = geo
        _save_cache()

    return result
