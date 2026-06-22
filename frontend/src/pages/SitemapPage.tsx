import { Link } from 'react-router-dom'

export default function SitemapPage() {
  const groups = [
    { title: '开始', links: [
      { to: '/', label: '首页', desc: '注册免费二级域名，几秒上线' },
      { to: '/available-domains', label: '可用域名', desc: '看本平台提供哪些根域名 + 即时查可用' },
      { to: '/promo', label: '新人福利', desc: '登录后免费领积分，限量活动先到先得' },
    ]},
    { title: '工具', links: [
      { to: '/whois', label: 'WHOIS 查询', desc: '查子域的注册信息' },
      { to: '/knowledge-base', label: '知识库', desc: '积分规则、上手指南、API 文档' },
      { to: '/featured-sites', label: '优质站点推荐', desc: '用户投稿的精选站点' },
    ]},
    { title: '用户中心（需登录）', links: [
      { to: '/dashboard', label: '控制台', desc: '概览 / 公告 / 邀请' },
      { to: '/register', label: '注册域名', desc: '查询并认领新前缀' },
      { to: '/my-domains', label: '我的域名', desc: '管理已认领的子域名与 DNS 记录' },
      { to: '/invite', label: '邀请好友', desc: '拿邀请链接 / 自定义邀请码' },
      { to: '/credits', label: '积分中心', desc: '余额、兑换码、收支明细' },
      { to: '/activity', label: '活动记录', desc: '积分/域名操作流水' },
      { to: '/api-keys', label: 'API Key', desc: '对外 API 接入' },
    ]},
    { title: '其他', links: [
      { to: '/about', label: '关于', desc: '团队 / 项目愿景' },
      { to: '/tos', label: '服务条款', desc: '使用本平台的条款' },
      { to: '/privacy', label: '隐私政策', desc: '数据收集与使用' },
      { to: '/contact', label: '联系我们', desc: '邮箱 / 工单入口' },
      { to: '/report', label: '举报滥用', desc: '举报违法 / 钓鱼 / spam 子域' },
    ]},
  ]

  return (
    <div className="page" style={{ maxWidth:'48rem' }}>
      <h1>站点地图</h1>
      <p className="page-desc">全站导航</p>

      {groups.map(g => (
        <div key={g.title} style={{ marginBottom:'2rem' }}>
          <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.75rem', color:'var(--text-secondary)' }}>{g.title}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {g.links.map(l => (
              <Link key={l.to} to={l.to} className="card card-hover"
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1rem', textDecoration:'none', color:'inherit' }}>
                <span style={{ fontWeight:600, fontSize:'0.875rem' }}>{l.label}</span>
                <span style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>{l.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
