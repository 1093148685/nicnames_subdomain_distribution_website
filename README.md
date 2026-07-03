# 公益二级域名分发平台

线上地址：https://dns.ccocc.cyou/

这是一个基于 React + FastAPI 开发的公益二级域名分发平台，支持用户注册登录、子域名申请、DNS 记录管理、积分系统、邀请奖励、后台审核和域名管理等功能。

## 技术栈

- 前端：React、TypeScript、Vite、Axios
- 后端：FastAPI、SQLAlchemy、SQLite、JWT
- DNS：NicNames API、Playwright 自动化辅助删除记录
- 部署：Python Uvicorn、Nginx / OpenResty

## 主要功能

- 用户注册、登录、账号设置
- 子域名实时查询和申请
- DNS 记录增删改查，并同步到真实域名解析
- 积分系统、邀请奖励、API Key 管理
- 后台用户管理、域名管理、审核管理、系统设置和审计日志
- IP / 浏览器指纹记录与安全风控
- GitHub / Linux.do OIDC 登录集成

## 访问

- 平台首页：https://dns.ccocc.cyou/
