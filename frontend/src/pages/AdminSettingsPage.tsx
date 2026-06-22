import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'
import { SITE_LOGO_URL } from '../components/SiteLogo'

const DEFAULT_SETTINGS = {
  login_enabled: 'true',
  registration_enabled: 'true',
  email_login_enabled: 'true',
  email_registration_enabled: 'true',
  oidc_login_enabled: 'false',
  oidc_registration_enabled: 'false',
  registration_code_required: 'true',
  email_verification_required: 'true',
  smtp_host: '',
  smtp_port: '587',
  smtp_username: '',
  smtp_password: '',
  smtp_from_email: '',
  smtp_from_name: 'DNS Portal',
  smtp_use_tls: 'true',
  domain_default_price: '10',
  active_dns_provider: 'nicnames',
  dns_providers: 'nicnames',
  security_scanner_enabled: 'true',
  security_auto_ban_enabled: 'true',
  security_ban_seconds: '86400',
  security_404_window_seconds: '600',
  security_404_threshold: '3',
  security_force_https_admin_enabled: 'false',
  security_admin_exempt_enabled: 'true',
  security_suspicious_ip_ban_enabled: 'true',
  security_login_fail_lock_enabled: 'true',
  security_register_domain_limit: '3',
  security_register_subnet_limit: '5',
  showcase_default_avatar_url: SITE_LOGO_URL,
  github_client_id: '',
  github_client_secret: '',
  linuxdo_client_id: '',
  linuxdo_client_secret: '',
  oidc_bonus_default: '10',
  oidc_bonus_github: '[{"years_min":0,"years_max":1,"credits":10},{"years_min":1,"years_max":3,"credits":50},{"years_min":3,"years_max":5,"credits":200},{"years_min":5,"years_max":999,"credits":1000}]',
  oidc_bonus_linuxdo: '[{"trust_level_min":0,"trust_level_max":1,"credits":10},{"trust_level_min":1,"trust_level_max":3,"credits":50},{"trust_level_min":3,"trust_level_max":5,"credits":200}]',
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)
  const [quick, setQuick] = useState<Record<string, string>>(DEFAULT_SETTINGS)
  const [security, setSecurity] = useState<{ config: any; blocked_ips: any[]; blocked_count: number } | null>(null)

  const asMap = (list: any[]) => Object.fromEntries(list.map(s => [s.key, s.value]))
  const bool = (key: string) => quick[key] === 'true'
  const setBool = (key: string, value: boolean) => setQuick(q => ({ ...q, [key]: value ? 'true' : 'false' }))
  const setText = (key: string, value: string) => setQuick(q => ({ ...q, [key]: value }))

  const fetchSettings = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [data, sec] = await Promise.all([api.adminGetSettings(), api.adminGetSecurity().catch(() => null)])
      const list = data.settings || []
      setSettings(list)
      setQuick(q => ({ ...q, ...asMap(list), ...(sec?.config ? {
        security_scanner_enabled: sec.config.scanner_enabled ? 'true' : 'false',
        security_auto_ban_enabled: sec.config.auto_ban_enabled ? 'true' : 'false',
        security_ban_seconds: String(sec.config.ban_seconds ?? q.security_ban_seconds),
        security_404_window_seconds: String(sec.config.score_window_seconds ?? q.security_404_window_seconds),
        security_404_threshold: String(sec.config.score_threshold ?? q.security_404_threshold),
        security_force_https_admin_enabled: sec.config.force_https_admin_enabled ? 'true' : 'false',
        security_admin_exempt_enabled: sec.config.admin_exempt_enabled ? 'true' : 'false',
        security_suspicious_ip_ban_enabled: sec.config.suspicious_ip_ban_enabled ? 'true' : 'false',
        security_login_fail_lock_enabled: sec.config.login_fail_lock_enabled ? 'true' : 'false',
        security_register_domain_limit: String(sec.config.register_domain_limit ?? q.security_register_domain_limit),
        security_register_subnet_limit: String(sec.config.register_subnet_limit ?? q.security_register_subnet_limit),
      } : {}) }))
      if (sec) setSecurity(sec)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    const timer = window.setInterval(() => { if (!editingKey && !saving) fetchSettings(true) }, 20000)
    return () => window.clearInterval(timer)
  }, [editingKey, saving])

  const saveQuickSettings = async () => {
    setSaving(true)
    try {
      await api.adminUpdateSettings(quick)
      showToast('登录、安全、邮箱发送、供应商与扫描封禁策略已保存', 'success')
      fetchSettings()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (key: string) => {
    setSaving(true)
    try {
      await api.adminUpdateSetting(key, editValue)
      showToast(`配置 "${key}" 已更新`, 'success')
      setEditingKey(null)
      setEditValue('')
      fetchSettings()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) {
      showToast('键名和值都不能为空', 'error')
      return
    }
    setSaving(true)
    try {
      await api.adminUpdateSetting(newKey.trim(), newValue.trim())
      showToast(`配置 "${newKey.trim()}" 已创建`, 'success')
      setNewKey('')
      setNewValue('')
      fetchSettings()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm(`确认删除配置 "${key}"？`)) return
    try {
      await api.adminDeleteSetting(key)
      showToast(`配置 "${key}" 已删除`, 'success')
      fetchSettings()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail.trim()) { showToast('请填写测试收件邮箱', 'error'); return }
    setTestingEmail(true)
    try {
      await api.adminTestEmail(testEmail.trim())
      showToast('测试邮件已发送', 'success')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setTestingEmail(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">管理系统全局键值配置、登录安全策略与 DNS 供应商模式。</p>

      <div className="settings-grid" style={{ marginBottom: '1rem' }}>
        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>登录与安全</h3>
              <p>控制普通用户登录、注册，以及允许哪些方式；管理员登录入口始终保留。</p>
            </div>
            <span className="badge badge-primary">实时生效</span>
          </div>
          <Toggle label="允许登录" desc="关闭后仅限制普通用户登录，管理员仍可登录" checked={bool('login_enabled')} onChange={v => setBool('login_enabled', v)} />
          <Toggle label="允许注册" desc="关闭后隐藏注册入口并拒绝注册接口" checked={bool('registration_enabled')} onChange={v => setBool('registration_enabled', v)} />
          <Toggle label="邮箱登录" desc="普通用户邮箱密码登录开关；管理员不受影响" checked={bool('email_login_enabled')} onChange={v => setBool('email_login_enabled', v)} />
          <Toggle label="邮箱注册" desc="允许用邮箱创建账号" checked={bool('email_registration_enabled')} onChange={v => setBool('email_registration_enabled', v)} />
          <Toggle label="注册需要邀请码" desc="开启后必须填写真实存在的邀请码，乱写会被拒绝" checked={bool('registration_code_required')} onChange={v => setBool('registration_code_required', v)} />
          <Toggle label="邮箱验证码注册" desc="开启后普通邮箱注册必须先收取并填写验证码" checked={bool('email_verification_required')} onChange={v => setBool('email_verification_required', v)} />
          <Toggle label="OIDC 登录" desc="允许使用 GitHub/Linux.do 等第三方登录" checked={bool('oidc_login_enabled')} onChange={v => setBool('oidc_login_enabled', v)} />
          <Toggle label="OIDC 注册" desc="允许 OIDC 首次登录时创建账号" checked={bool('oidc_registration_enabled')} onChange={v => setBool('oidc_registration_enabled', v)} />
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>OIDC 第三方登录配置</h3>
              <p>配置 GitHub 和 Linux.do 的 OAuth 凭据。保存后需重启后端生效。回调 URL：<code>{window.location.origin}/api/auth/oidc/github/callback</code> 和 <code>{window.location.origin}/api/auth/oidc/linuxdo/callback</code></p>
            </div>
            <span className="badge badge-primary">OIDC</span>
          </div>
          <label className="form-group"><span>GitHub Client ID</span>
            <input className="input" value={quick.github_client_id || ''} onChange={e => setText('github_client_id', e.target.value)} placeholder="Iv1..." />
          </label>
          <label className="form-group"><span>GitHub Client Secret</span>
            <input className="input" type="password" value={quick.github_client_secret === '[已隐藏]' ? '' : (quick.github_client_secret || '')} onChange={e => setText('github_client_secret', e.target.value)} placeholder={quick.github_client_secret === '[已隐藏]' ? '已配置，留空保持不变' : '输入 GitHub Client Secret'} />
          </label>
          <label className="form-group"><span>Linux.do Client ID</span>
            <input className="input" value={quick.linuxdo_client_id || ''} onChange={e => setText('linuxdo_client_id', e.target.value)} placeholder="app_..." />
          </label>
          <label className="form-group"><span>Linux.do Client Secret</span>
            <input className="input" type="password" value={quick.linuxdo_client_secret === '[已隐藏]' ? '' : (quick.linuxdo_client_secret || '')} onChange={e => setText('linuxdo_client_secret', e.target.value)} placeholder={quick.linuxdo_client_secret === '[已隐藏]' ? '已配置，留空保持不变' : '输入 Linux.do Client Secret'} />
          </label>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>OIDC 注册积分奖励</h3>
              <p>用户通过 GitHub/Linux.do 首次登录时，根据账号信息自动计算奖励积分。</p>
            </div>
            <span className="badge badge-primary">OIDC</span>
          </div>
          <label className="form-group"><span>默认奖励积分（无规则匹配时）</span>
            <input className="input" type="number" min="0" value={quick.oidc_bonus_default || '10'} onChange={e => setText('oidc_bonus_default', e.target.value)} />
          </label>
          <label className="form-group" style={{ marginTop:'0.75rem' }}>
            <span>GitHub 规则 <code style={{ fontSize:'0.7rem' }}>JSON: [{"years_min","years_max","credits"}]</code></span>
            <textarea className="input" rows={4} style={{ fontFamily:'monospace', fontSize:'0.75rem' }}
              value={quick.oidc_bonus_github || ''}
              onChange={e => setText('oidc_bonus_github', e.target.value)}
              placeholder='[{"years_min":0,"years_max":1,"credits":10},...]'
            />
          </label>
          <label className="form-group"><span>Linux.do 规则 <code style={{ fontSize:'0.7rem' }}>JSON: [{"trust_level_min","trust_level_max","credits"}]</code></span>
            <textarea className="input" rows={4} style={{ fontFamily:'monospace', fontSize:'0.75rem' }}
              value={quick.oidc_bonus_linuxdo || ''}
              onChange={e => setText('oidc_bonus_linuxdo', e.target.value)}
              placeholder='[{"trust_level_min":0,"trust_level_max":1,"credits":10},...]'
            />
          </label>
          <p style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.5rem' }}>
            GitHub 按账号注册年数匹配；Linux.do 按 trust_level（0-4）匹配。修改后立即生效。
          </p>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>邮箱发送配置</h3>
              <p>用于注册验证码、换绑邮箱验证码等邮件发送；密码会在后台列表中脱敏。</p>
            </div>
            <span className="badge badge-primary">SMTP</span>
          </div>
          <label className="form-group"><span>SMTP 服务器</span>
            <input className="input" value={quick.smtp_host || ''} onChange={e => setText('smtp_host', e.target.value)} placeholder="smtp.example.com" />
          </label>
          <label className="form-group"><span>SMTP 端口</span>
            <input className="input" type="number" value={quick.smtp_port || '587'} onChange={e => setText('smtp_port', e.target.value)} placeholder="587" />
          </label>
          <label className="form-group"><span>SMTP 用户名</span>
            <input className="input" value={quick.smtp_username || ''} onChange={e => setText('smtp_username', e.target.value)} placeholder="通常为邮箱账号" />
          </label>
          <label className="form-group"><span>SMTP 密码 / 授权码</span>
            <input className="input" type="password" value={quick.smtp_password === '[已隐藏]' ? '' : (quick.smtp_password || '')} onChange={e => setText('smtp_password', e.target.value)} placeholder={quick.smtp_password === '[已隐藏]' ? '已配置，留空会覆盖为空；需要修改请重新填写' : '邮箱授权码'} />
          </label>
          <label className="form-group"><span>发件邮箱</span>
            <input className="input" type="email" value={quick.smtp_from_email || ''} onChange={e => setText('smtp_from_email', e.target.value)} placeholder="noreply@example.com" />
          </label>
          <label className="form-group"><span>发件名称</span>
            <input className="input" value={quick.smtp_from_name || 'DNS Portal'} onChange={e => setText('smtp_from_name', e.target.value)} placeholder="DNS Portal" />
          </label>
          <Toggle label="启用 STARTTLS" desc="587 端口通常开启；465 SSL 暂未单独处理，可先使用 587" checked={bool('smtp_use_tls')} onChange={v => setBool('smtp_use_tls', v)} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <input className="input" type="email" placeholder="测试收件邮箱" value={testEmail} onChange={e => setTestEmail(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
            <button className="btn btn-outline" type="button" onClick={handleTestEmail} disabled={testingEmail}>{testingEmail ? '发送中...' : '发送测试邮件'}</button>
          </div>
        </section>

        <section className="card settings-card security-policy-card">
          <div className="settings-card-head">
            <div>
              <h3>扫描封禁策略</h3>
              <p>只作用于 DNS Portal（二级域名分发站点），用于拦截 .env、wp-admin、SQL 注入和连续 404 探测。</p>
            </div>
            <span className="badge badge-success">{security?.blocked_count || 0} 个封禁</span>
          </div>
          <Toggle label="启用扫描识别" desc="识别常见扫描路径并返回 403" checked={bool('security_scanner_enabled')} onChange={v => setBool('security_scanner_enabled', v)} />
          <Toggle label="命中后自动封禁 IP" desc="公网 IP 命中特征或连续探测会写入封禁列表" checked={bool('security_auto_ban_enabled')} onChange={v => setBool('security_auto_ban_enabled', v)} />
          <Toggle label="默认不影响管理员" desc="开启后 /admin、/api/admin 和登录入口不受扫描封禁策略影响，避免管理员被误封后进不来" checked={bool('security_admin_exempt_enabled')} onChange={v => setBool('security_admin_exempt_enabled', v)} />
          <Toggle label="强制后台 HTTPS 跳转" desc="默认关闭；只有确认公网 HTTPS 证书可信后再开启" checked={bool('security_force_https_admin_enabled')} onChange={v => setBool('security_force_https_admin_enabled', v)} />
          <Toggle label="可疑来源 IP 自动封禁" desc="Tor 出口节点、已知恶意 VPS 机房 IP 直接拦截" checked={bool('security_suspicious_ip_ban_enabled')} onChange={v => setBool('security_suspicious_ip_ban_enabled', v)} />
          <Toggle label="登录失败锁定" desc="同一账号+IP 5 分钟内失败 5 次封 30 分钟" checked={bool('security_login_fail_lock_enabled')} onChange={v => setBool('security_login_fail_lock_enabled', v)} />
          <label className="form-group"><span>封禁时长（秒）</span>
            <input className="input" type="number" min="300" max="604800" value={quick.security_ban_seconds || '86400'} onChange={e => setText('security_ban_seconds', e.target.value)} />
          </label>
          <label className="form-group"><span>连续 404 统计窗口（秒）</span>
            <input className="input" type="number" min="60" max="86400" value={quick.security_404_window_seconds || '600'} onChange={e => setText('security_404_window_seconds', e.target.value)} />
          </label>
          <label className="form-group"><span>连续 404 封禁阈值</span>
            <input className="input" type="number" min="2" max="100" value={quick.security_404_threshold || '3'} onChange={e => setText('security_404_threshold', e.target.value)} />
          </label>
          <label className="form-group"><span>同邮箱域名每日注册上限</span>
            <input className="input" type="number" min="1" max="50" value={quick.security_register_domain_limit || '3'} onChange={e => setText('security_register_domain_limit', e.target.value)} />
          </label>
          <label className="form-group"><span>同 /24 网段每日注册上限</span>
            <input className="input" type="number" min="1" max="50" value={quick.security_register_subnet_limit || '5'} onChange={e => setText('security_register_subnet_limit', e.target.value)} />
          </label>
          <div className="blocked-ip-list">
            {(security?.blocked_ips || []).length === 0 ? <p>当前没有封禁 IP。</p> : security?.blocked_ips.map(item => (
              <div className="blocked-ip-item" key={item.ip}>
                <div><strong>{item.ip}</strong><em>{item.reason} · {item.path}</em></div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={async () => { await api.adminUnblockIp(item.ip); showToast('已解除封禁', 'success'); fetchSettings(true) }}>解除</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>DNS 多供应商</h3>
              <p>当前生产供应商为 NicNames，保留 Cloudflare 等供应商扩展位。</p>
            </div>
            <span className="badge badge-success">NicNames</span>
          </div>
          <label className="form-group"><span>当前启用供应商</span>
            <select className="input" value={quick.active_dns_provider || 'nicnames'} onChange={e => setText('active_dns_provider', e.target.value)}>
              <option value="nicnames">NicNames</option>
              <option value="cloudflare">Cloudflare（预留）</option>
            </select>
          </label>
          <label className="form-group"><span>已启用供应商列表</span>
            <input className="input" value={quick.dns_providers || 'nicnames'} onChange={e => setText('dns_providers', e.target.value)} placeholder="nicnames,cloudflare" />
          </label>
          <label className="form-group"><span>默认注册价格（积分）</span>
            <input className="input" type="number" min="1" value={quick.domain_default_price || '10'} onChange={e => setText('domain_default_price', e.target.value)} />
          </label>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            单个根域名可用配置键 <code>domain_price:example.com</code> 覆盖价格，避免出现 0 积分免费注册漏洞。
          </p>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>公开展示配置</h3>
              <p>控制优质站点卡片的默认头像。投稿或后台站点未填写头像 URL 时使用这里的地址。</p>
            </div>
            <span className="badge badge-primary">Showcase</span>
          </div>
          <label className="form-group"><span>默认头像 URL</span>
            <input className="input" value={quick.showcase_default_avatar_url || ''} onChange={e => setText('showcase_default_avatar_url', e.target.value)} placeholder="https://example.com/avatar.png" />
          </label>
        </section>

      </div>

      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={saveQuickSettings} disabled={saving}>{saving ? '保存中...' : '保存设置'}</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>添加 / 修改配置</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          创建新配置或覆盖已有配置。
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input className="input" placeholder="键名（如 site_name）" value={newKey}
            onChange={e => setNewKey(e.target.value)} style={{ flex: '1', minWidth: '140px' }} />
          <input className="input" placeholder="值" value={newValue}
            onChange={e => setNewValue(e.target.value)} style={{ flex: '2', minWidth: '200px' }} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newKey.trim() || !newValue.trim()}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>

      <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.75rem' }}>当前配置</h3>
      {settings.length === 0 ? <div className="empty-state"><p>暂无配置</p></div> : (
        <div className="table-wrap">
          <table><thead><tr><th>键名</th><th>值</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>{settings.map(s => (
              <tr key={s.key || s.id}>
                <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8125rem' }}>{s.key}</td>
                <td style={{ fontSize: '0.8125rem' }}>{editingKey === s.key ? (
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <input className="input" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUpdate(s.key)} style={{ fontSize: '0.8125rem' }} />
                    <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(s.key)} disabled={saving}>{saving ? '...' : '保存'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingKey(null); setEditValue('') }}>取消</button>
                  </div>
                ) : <span style={{ wordBreak: 'break-word' }}>{s.value}</span>}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.updated_at ? new Date(s.updated_at).toLocaleString() : '-'}</td>
                <td><div style={{ display: 'flex', gap: '0.375rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingKey(s.key); setEditValue(s.value) }}>编辑</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.key)}>删除</button>
                </div></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{label}</strong><em>{desc}</em></span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
}

function PageSkeleton() {
  return <div className="loading-stack"><div className="skeleton skeleton-line" style={{ width: '220px', height: 18 }} /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
}
