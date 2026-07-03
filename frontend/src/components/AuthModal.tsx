import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'

interface Props {
  open: boolean
  onClose: () => void
  defaultMode?: 'signin' | 'signup'
}

export default function AuthModal({ open, onClose, defaultMode = 'signin' }: Props) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [animateDir, setAnimateDir] = useState<'left' | 'right'>('right')
  const [switching, setSwitching] = useState(false)

  // Sign-in fields
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)

  // Sign-up fields
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [showRegPw, setShowRegPw] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authConfig, setAuthConfig] = useState<any>({ login_enabled: true, registration_enabled: true, email_login_enabled: true, email_registration_enabled: true, oidc_login_enabled: false, oidc_registration_enabled: false })

  const loginRef = useRef<HTMLInputElement>(null)
  const regUserRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    api.getAuthConfig().then(setAuthConfig).catch(() => {})
  }, [open])

  // Open/close animation
  useEffect(() => {
    if (open) {
      setClosing(false)
      requestAnimationFrame(() => setVisible(true))
    } else {
      setClosing(true)
      setTimeout(() => {
        setVisible(false)
        setClosing(false)
      }, 200)
    }
  }, [open])

  // Focus first input when mode changes
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      if (mode === 'signin') loginRef.current?.focus()
      else regUserRef.current?.focus()
    }, 250)
    return () => clearTimeout(timer)
  }, [mode, visible])

  const resetFields = () => {
    setLoginId('')
    setPassword('')
    setShowPw(false)
    setRegUsername('')
    setRegEmail('')
    setRegPassword('')
    setShowRegPw(false)
    setInviteCode('')
    setEmailCode('')
    setError('')
  }

  const switchMode = (m: 'signin' | 'signup') => {
    if (m === mode || switching) return
    setAnimateDir(m === 'signup' ? 'right' : 'left')
    setSwitching(true)
    resetFields()
    setTimeout(() => {
      setMode(m)
      setSwitching(false)
    }, 150)
  }

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(loginId, password, remember)
      handleClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    if (!authConfig.registration_enabled || !authConfig.email_registration_enabled) { setError('当前未开放邮箱注册'); return }
    if (regPassword.length < 6) {
      setError('密码至少 6 位字符')
      return
    }
    setError('')
    setLoading(true)
    try {
      await signUp({ username: regUsername, email: regEmail, password: regPassword, invite_code: inviteCode || undefined, email_code: emailCode || undefined })
      handleClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendSignupCode = async () => {
    if (!regEmail || !regEmail.includes('@')) { setError('请先填写正确的邮箱'); return }
    setError('')
    setSendingCode(true)
    try {
      await api.sendSignupEmailCode(regEmail)
      setError('验证码已发送，请查收邮箱')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSendingCode(false)
    }
  }

  const handleOverlay = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }

  if (!visible && !closing) return null

  return (
    <div
      className={`modal-overlay${closing ? ' closing' : ''}`}
      onClick={handleOverlay}
    >
      <div className={`modal${closing ? ' closing' : ''}`}>
        <div className="modal-header">
          <div className="modal-header-tabs">
            <button
              className={`pill-tab${mode === 'signin' && !switching ? ' active' : ''}`}
              onClick={() => switchMode('signin')}
            >登录</button>
            {authConfig.registration_enabled !== false && (
              <button
                className={`pill-tab${mode === 'signup' && !switching ? ' active' : ''}`}
                onClick={() => switchMode('signup')}
              >注册</button>
            )}
          </div>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="auth-form-wrap">
          <div
            className={`auth-form-slider${switching ? ' switching' : ''}`}
            style={{ transform: switching ? `translateX(${animateDir === 'right' ? '-30px' : '30px'})` : 'translateX(0)', opacity: switching ? 0 : 1 }}
          >
            {mode === 'signin' ? (
              <form key="signin" onSubmit={handleSignIn}>
                <h2>登录</h2>
                <p>{authConfig.login_enabled === false || authConfig.email_login_enabled === false ? '普通用户登录已关闭，管理员仍可登录' : '使用用户名或邮箱登录你的账号'}</p>

                {error && <div className="auth-error">{error}</div>}

                <div className="form-group">
                  <label>用户名或邮箱</label>
                  <input ref={loginRef} className="input" type="text" placeholder="输入用户名或邮箱" value={loginId}
                    onChange={e => setLoginId(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>密码</label>
                  <div className="pw-input-wrap">
                    <input className="input" type={showPw ? 'text' : 'password'} placeholder="输入密码" value={password}
                      onChange={e => setPassword(e.target.value)} required />
                    <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} tabIndex={-1} aria-label="切换密码显示">
                      {showPw ? EyeSlash : Eye}
                    </button>
                  </div>
                </div>
                <div className="form-row">
                  <label className="checkbox-group">
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                    <span>记住我（30天）</span>
                  </label>
                  <button className="btn btn-link btn-sm" type="button" onClick={() => alert('请联系管理员重置密码')}>
                    忘记密码？
                  </button>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-outline" onClick={handleClose}>取消</button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <span className="btn-loading" /> : null}
                    {loading ? '登录中...' : '登录'}
                  </button>
                </div>

                {/* OIDC buttons */}
                {authConfig.oidc_providers?.filter((p: any) => p.enabled).length > 0 && (
                  <div className="oidc-divider">
                    <span>或使用以下方式登录</span>
                  </div>
                )}
                <div className="oidc-buttons">
                  {authConfig.oidc_providers?.map((p: any) => p.enabled && (
                    <button key={p.key} type="button" className={`btn oidc-btn oidc-${p.key}`}
                      onClick={() => {
                        window.location.href = `/api/auth/oidc/${p.key}?redirect=${encodeURIComponent(window.location.pathname)}`
                      }}>
                      {p.key === 'github' ? GithubIcon : p.key === 'linuxdo' ? LinuxdoIcon : null}
                      {p.name}
                    </button>
                  ))}
                </div>
              </form>
            ) : (
              <form key="signup" onSubmit={handleSignUp}>
                <h2>注册</h2>
                <p>{authConfig.email_registration_enabled === false ? '当前未开放邮箱注册' : '创建账号，开始管理免费域名'}</p>

                {error && <div className="auth-error">{error}</div>}

                <div className="form-group">
                  <label>用户名</label>
                  <input ref={regUserRef} className="input" type="text" placeholder="3-32 位字符" value={regUsername}
                    onChange={e => setRegUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>邮箱</label>
                  <input className="input" type="email" placeholder="输入邮箱地址" value={regEmail}
                    onChange={e => setRegEmail(e.target.value)} required />
                </div>
                {authConfig.email_verification_required !== false && (
                  <div className="form-group">
                    <label>邮箱验证码</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input className="input" type="text" placeholder="6 位验证码" value={emailCode}
                        onChange={e => setEmailCode(e.target.value)} required style={{ flex: 1 }} />
                      <button type="button" className="btn btn-outline" onClick={handleSendSignupCode} disabled={sendingCode || !regEmail}>
                        {sendingCode ? '发送中...' : '获取验证码'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>密码</label>
                  <div className="pw-input-wrap">
                    <input className="input" type={showRegPw ? 'text' : 'password'} placeholder="至少 6 位字符" minLength={6} value={regPassword}
                      onChange={e => setRegPassword(e.target.value)} required />
                    <button type="button" className="pw-toggle" onClick={() => setShowRegPw(!showRegPw)} tabIndex={-1} aria-label="切换密码显示">
                      {showRegPw ? EyeSlash : Eye}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>邀请码 <span className="optional">（{authConfig.registration_code_required ? '必填' : '可选'}）</span></label>
                  <input className="input" type="text" placeholder="输入邀请码" value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)} required={!!authConfig.registration_code_required} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-outline" onClick={handleClose}>取消</button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <span className="btn-loading" /> : null}
                    {loading ? '注册中...' : '注册'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Inline SVG icons
const Eye = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeSlash = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const GithubIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

const LinuxdoIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">L</text>
  </svg>
)
