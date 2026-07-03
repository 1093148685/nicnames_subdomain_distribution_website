import { useState, type FormEvent } from 'react'
import { useAuth } from '../AuthContext'

interface Props { open: boolean; onClose: () => void; onSwitchToSignIn: () => void }

export default function SignUpModal({ open, onClose, onSwitchToSignIn }: Props) {
  const { signUp } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signUp({ username, email, password, invite_code: inviteCode || undefined })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOverlay = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-tabs">
          <button className="modal-tab" onClick={onSwitchToSignIn}>登录</button>
          <button className="modal-tab active">注册</button>
        </div>
        <h2>注册</h2>
        <p>创建你的账号，开始管理免费域名</p>

        {error && <div className="toast-item error" style={{ marginBottom:'1rem', animation:'none' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input className="input" type="text" placeholder="输入用户名" value={username}
              onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>邮箱</label>
            <input className="input" type="email" placeholder="输入邮箱地址" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input className="input" type="password" placeholder="至少 6 位字符" minLength={6} value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>邀请码 <span style={{ color:'var(--text-secondary)', fontWeight:400 }}>（可选）</span></label>
            <input className="input" type="text" placeholder="输入邀请码" value={inviteCode}
              onChange={e => setInviteCode(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
        </form>

        <div style={{ textAlign:'center', marginTop:'1rem', fontSize:'0.8125rem' }}>
          已有账号？<button className="btn btn-ghost" type="button" onClick={onSwitchToSignIn}
            style={{ padding:0, color:'var(--primary)', background:'none', fontSize:'0.8125rem' }}>立即登录</button>
        </div>
      </div>
    </div>
  )
}
