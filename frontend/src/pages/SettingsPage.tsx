import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'
import { useAuth } from '../AuthContext'

// --- Default Avatar SVG: minimalist gradient circle with user initial ---
function DefaultAvatar({ username, size = 64 }: { username?: string; size?: number }) {
  const initial = (username || 'U')[0]?.toUpperCase() || 'U'
  const colors = [
    ['#14b8a6', '#0d9488'],
    ['#6366f1', '#4f46e5'],
    ['#f59e0b', '#d97706'],
    ['#ef4444', '#dc2626'],
    ['#8b5cf6', '#7c3aed'],
    ['#ec4899', '#db2777'],
  ]
  // deterministic colour from username hash
  const idx = (username || 'U').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  const [c1, c2] = colors[idx]
  const half = size / 2
  const fontSize = size * 0.42
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: '50%', flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={`avgrad-${username || 'U'}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx={half} cy={half} r={half} fill={`url(#avgrad-${username || 'U'})`} />
      <text x={half} y={half} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={fontSize} fontWeight={700} fontFamily="Inter, sans-serif">
        {initial}
      </text>
    </svg>
  )
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [emailLocal, setEmailLocal] = useState(user?.email?.split('@')[0] || '')
  const [emailDomain, setEmailDomain] = useState(user?.email?.includes('@') ? '@' + user.email.split('@')[1] : '@qq.com')
  const [verificationCode, setVerificationCode] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [whoisPrivacy, setWhoisPrivacy] = useState(user?.whois_privacy ?? true)

  const handlePasswordSave = async () => {
    if (!currentPassword || !newPassword) {
      showToast('请填写当前密码和新密码', 'error')
      return
    }
    setSavingPassword(true)
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword })
      showToast('密码已更新', 'success')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSendCode = async () => {
    const email = emailLocal + emailDomain
    setSendingCode(true)
    try {
      await api.sendEmailCode(email)
      showToast('验证码已发送', 'success')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSendingCode(false)
    }
  }

  const handleEmailSave = async () => {
    const email = emailLocal + emailDomain
    if (!email.includes('@')) {
      showToast('请输入有效邮箱', 'error')
      return
    }
    setSavingEmail(true)
    try {
      await api.changeEmail({ email, code: verificationCode || undefined })
      showToast('邮箱已更新', 'success')
      refreshUser()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSavingEmail(false)
    }
  }

  const handleOidcBind = (provider: string) => {
    const path = window.location.pathname + window.location.search
    window.location.href = `/api/auth/oidc/${provider}?redirect=${encodeURIComponent(path)}&intent=bind`
  }

  const oidcProvider = user?.oidc_provider || null
  const oidcName = oidcProvider === 'github' ? 'GitHub' : oidcProvider === 'linuxdo' ? 'Linux.do' : null

  if (!user) {
    return <div className="page"><p className="page-desc">请先登录</p></div>
  }

  const avatar = user.oidc_avatar || null
  const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <div style={{ maxWidth: '42rem' }}>
      {/* ── Profile Hero ── */}
      <div className="card" style={{
        display: 'flex', alignItems: 'center', gap: '1.25rem',
        padding: '1.75rem 1.5rem', marginBottom: '1.25rem',
      }}>
        {avatar ? (
          <img src={avatar} alt="avatar"
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }} />
        ) : (
          <DefaultAvatar username={user.username} size={64} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.125rem' }}>
            {user.username}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {user.email}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-primary" style={{ fontSize: '0.6875rem' }}>
              {user.role === 'admin' ? '管理员' : '用户'}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              积分 {user.credits}
            </span>
            {joinDate && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                注册于 {joinDate}
              </span>
            )}
            {oidcName && (
              <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>
                {oidcName} 已绑定
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 账号安全 ── */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          修改密码
        </h3>
        <div className="form-group">
          <label>当前密码</label>
          <input className="input" type="password" value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div className="form-group">
          <label>新密码</label>
          <input className="input" type="password" placeholder="至少 6 个字符" minLength={6} value={newPassword}
            onChange={e => setNewPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handlePasswordSave} disabled={savingPassword}>
          {savingPassword ? '保存中...' : '更新密码'}
        </button>
      </div>

      {/* ── 邮箱 ── */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          邮箱地址
        </h3>
        <div className="form-group">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" value={emailLocal}
              onChange={e => setEmailLocal(e.target.value)} style={{ flex: 1 }} />
            <select className="input" style={{ width: 'auto' }} value={emailDomain}
              onChange={e => setEmailDomain(e.target.value)}>
              <option>@qq.com</option>
              <option>@gmail.com</option>
              <option>@outlook.com</option>
              <option>@163.com</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>验证码</label>
          <input className="input" placeholder="输入发送到新邮箱的验证码" value={verificationCode}
            onChange={e => setVerificationCode(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline btn-sm" onClick={handleSendCode} disabled={sendingCode}>
            {sendingCode ? '发送中...' : '发送验证码'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleEmailSave} disabled={savingEmail}>
            {savingEmail ? '保存中...' : '保存邮箱'}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
          修改邮箱需要验证新地址，验证码通过后立即生效。
        </p>
      </div>

      {/* ── WHOIS Privacy ── */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          隐私保护
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>WHOIS 隐私保护</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              开启后，其他人在查询你的域名时不会看到邮箱地址
            </p>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
            <input type="checkbox" checked={whoisPrivacy} onChange={e => setWhoisPrivacy(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '24px',
              background: whoisPrivacy ? 'var(--primary)' : 'var(--border)',
              transition: '0.3s',
            }}>
              <span style={{
                position: 'absolute', top: '2px', left: whoisPrivacy ? '22px' : '2px',
                width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                transition: '0.3s',
              }} />
            </span>
          </label>
        </div>
      </div>

      {/* ── 账号绑定 ── */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
          账号绑定
        </h3>

        {/* GitHub */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 0', borderBottom: '1px solid var(--divider)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#333' }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>GitHub</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {user?.oidc_provider === 'github'
                  ? '已绑定，可用 GitHub 登录此账号'
                  : '绑定后可用 GitHub 登录并使用 GitHub 头像'}
              </p>
            </div>
          </div>
          {user?.oidc_provider === 'github' ? (
            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>已绑定</span>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => handleOidcBind('github')}>
              绑定
            </button>
          )}
        </div>

        {/* Linux.do */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f97316' }}>
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
              <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">L</text>
            </svg>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Linux.do</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {user?.oidc_provider === 'linuxdo'
                  ? '已绑定，可用 Linux.do 登录此账号'
                  : '绑定后可用 Linux.do 登录此账号'}
              </p>
            </div>
          </div>
          {user?.oidc_provider === 'linuxdo' ? (
            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>已绑定</span>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => handleOidcBind('linuxdo')}>
              绑定
            </button>
          )}
        </div>
      </div>

      {/* ── 登录记录与设备指纹 ── */}
      <FingerprintSection />
    </div>
  )
}

function FingerprintSection() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    api.getMyFingerprints().then(data => {
      setRecords(data.fingerprints || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const formatUA = (ua: string) => {
    if (!ua) return { browser: '', os: '' }
    if (ua.includes('Windows NT 10.0')) return { os: 'Windows 10', browser: ua.includes('Edg') ? 'Edge' : ua.includes('Firefox') ? 'Firefox' : 'Chrome' }
    if (ua.includes('Android')) return { os: 'Android', browser: 'Chrome' }
    if (ua.includes('iPhone') || ua.includes('iPad')) return { os: 'iOS', browser: 'Safari' }
    if (ua.includes('Mac OS X')) return { os: 'macOS', browser: 'Safari' }
    if (ua.includes('Linux')) return { os: 'Linux', browser: ua.includes('Headless') ? 'Headless' : 'Chrome' }
    return { os: '', browser: '' }
  }

  // 按浏览器ID分组
  const byBrowser: Record<string, { records: any[]; count: number }> = {}
  records.forEach(r => {
    const key = r.browser_id || r.ip
    if (!byBrowser[key]) byBrowser[key] = { records: [], count: 0 }
    byBrowser[key].count++
  })
  const browserCount = Object.keys(byBrowser).length

  return (
    <div className="card" style={{ marginTop: '0.75rem' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10h-10V2z"/><path d="M12 12 8 8"/><circle cx="12" cy="12" r="2"/>
          </svg>
          登录记录与设备指纹
          {records.length > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
            {records.length} 条 · {browserCount} 个设备
          </span>}
        </h3>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
          {records.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>暂无记录</p>
          ) : (
            records.slice(0, 20).map(r => {
              const uaInfo = formatUA(r.user_agent)
              return (
                <div key={r.id} style={{
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  background: 'var(--bg)',
                  fontSize: '0.75rem',
                  lineHeight: '1.6',
                  marginBottom: '0.375rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>
                      {r.action === 'signup' ? '🎉 注册' : r.action === 'login' ? '🔑 登录' : '👁️ 访问'}
                      {uaInfo.os && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.25rem' }}>· {uaInfo.os}</span>}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.6875rem' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : ''}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                    <strong>IP:</strong> {r.ip}
                    {r.geo && r.geo !== r.ip && <span style={{ color: 'var(--primary)', fontSize: '0.6875rem' }}> · {r.geo}</span>}
                    {r.platform && <span> · <strong>平台:</strong> {r.platform}</span>}
                    {r.screen_resolution && <span> · <strong>分辨率:</strong> {r.screen_resolution}</span>}
                    {r.browser_id && <div style={{ marginTop: '0.125rem' }}><strong>浏览器ID:</strong> {r.browser_id.slice(0, 20)}</div>}
                  </div>
                </div>
              )
            })
          )}
          {records.length > 20 && (
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              显示最近 20 条，共 {records.length} 条
            </p>
          )}
        </div>
      )}
    </div>
  )
}
