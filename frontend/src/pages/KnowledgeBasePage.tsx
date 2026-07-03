export default function KnowledgeBasePage() {
  const sections = [
    { title: '积分规则', items: [
      '注册账号即送 10 积分',
      '邀请好友验证后，双方各得 10 积分',
      '注册域名消耗对应积分（不同根域价格不同）',
      '管理员发放兑换码可兑换积分',
    ]},
    { title: '上手指南', items: [
      '1. 注册并登录你的账号',
      '2. 在「可用域名」页面选择根域名',
      '3. 搜索你想要的子域名前缀',
      '4. 确认可用后点击注册（消耗积分）',
      '5. 在「我的域名」管理 DNS 记录',
    ]},
    { title: 'DNS 记录类型', items: [
      'A: 指向 IPv4 地址',
      'AAAA: 指向 IPv6 地址',
      'CNAME: 别名指向另一个域名',
      'MX: 邮件交换记录',
      'TXT: 文本记录（用于验证等）',
      'NS: 名称服务器记录',
      'SRV: 服务定位记录',
    ]},
  ]

  return (
    <div className="page" style={{ maxWidth:'48rem' }}>
      <h1>知识库</h1>
      <p className="page-desc">积分规则、上手指南和常见问题</p>

      {sections.map(s => (
        <div className="card" style={{ marginBottom:'1rem' }} key={s.title}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700, marginBottom:'0.75rem' }}>{s.title}</h2>
          <ul style={{ paddingLeft:'1.25rem', fontSize:'0.875rem', lineHeight:1.75, color:'var(--text-secondary)' }}>
            {s.items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
