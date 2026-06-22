# DNS Portal

免费二级域名分发与 DNS 自助管理平台。

## 功能

- **免费二级域名注册** — 在 NicNames 根域名下自助认领子域名
- **DNS 记录管理** — 支持 A、AAAA、CNAME、MX、TXT、CAA 记录的自助添加、修改、删除
- **NicNames 域名搜索** — 实时查询 NicNames 可注册域名及价格
- **WHOIS 查询** — 域名信息查询
- **积分系统** — 注册/邀请获得积分，用于域名注册
- **API 支持** — RESTful API 用于自动化管理
- **管理员后台** — 用户管理、域名管理、系统设置、安全策略、审核、审计日志
- **OIDC 第三方登录** — 支持 GitHub、Linux.do 登录
- **安全防护** — 扫描路径识别、IP 封禁、登录失败锁定、注册频率限制

## 技术栈

- **后端**: Python 3.13, FastAPI, SQLAlchemy, SQLite, Pydantic
- **前端**: React 19, TypeScript, Vite, React Router v7
- **DNS 供应商**: NicNames API + Playwright（删除操作）
- **认证**: JWT (python-jose)

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 20+
- (可选) Playwright — 用于 NicNames DNS 记录删除

### 后端启动

```bash
# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn app.web:app --host 0.0.0.0 --port 8096 --reload
```

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

### 生产构建

```bash
cd frontend
npm run build
# 构建产物输出到 ../static/ 目录
```

### 配置

编辑 `app/config.py` 或创建 `.env` 文件配置以下关键参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `secret_key` | JWT 签名密钥 | `CHANGE_ME-dns-portal-secret-key` |
| `nicnames_email` | NicNames 账号邮箱 | 需自行填写 |
| `nicnames_password` | NicNames 账号密码 | 需自行填写 |
| `oidc_base_url` | 站点公网地址 | `https://REDACTED.example.com` |

## 项目结构

```
dnsportal/
├── app/                  # 后端 Python 源码
│   ├── config.py         # 配置
│   ├── web.py            # FastAPI 路由与业务逻辑
│   ├── models.py         # SQLAlchemy 数据模型
│   ├── dns_manager.py    # NicNames DNS 管理模块
│   ├── geoip.py          # IP 地理位置查询
│   ├── templates/        # Jinja2 模板（备用）
│   └── static/           # Flask 风格静态文件
├── frontend/             # React 前端源码
│   ├── src/              # TypeScript/React 源码
│   └── public/           # 公共静态资源
├── static/               # 编译后的前端产物
├── tests/                # 测试
└── import_nicnames.py    # NicNames 数据导入脚本
```
