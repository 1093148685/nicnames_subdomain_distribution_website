import { useState, type FormEvent } from 'react'
import { useAuth } from '../AuthContext'

interface Props { open: boolean; onClose: () => void; onSwitchToSignUp: () => void }

export default function SignInModal({ open, onClose, onSwitchToSignUp }: Props) {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(username, password, remember)
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
          <button className="modal-tab active">登录</button>
          <button className="modal-tab" onClick={onSwitchToSignUp}>注册</button>
        </div>
        <h2>登录</h2>
        <p>使用用户名或邮箱登录你的账号</p>

        {error && <div className="toast-item error" style={{ marginBottom:'1rem', animation:'none' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名或邮箱</label>
            <input className="input" type="text" placeholder="输入用户名或邮箱" value={username}
              onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input className="input" type="password" placeholder="输入密码" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="form-group checkbox-group">
            <input type="checkbox" id="remember" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <label htmlFor="remember">记住我（30天）</label>
          </div>
          <button className="btn btn-ghost" type="button" style={{ padding:'0', fontSize:'0.8125rem', color:'var(--primary)', background:'none' }}
            onClick={() => alert('请联系管理员重置密码')}>
            忘记密码？
          </button>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
        </form>

        <div className="divider">或</div>
        <button className="btn btn-outline" style={{ width:'100%' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          使用 GitHub 登录
        </button>

        <div style={{ textAlign:'center', marginTop:'1rem', fontSize:'0.8125rem' }}>
          没有账号？<button className="btn btn-ghost" type="button" onClick={onSwitchToSignUp}
            style={{ padding:0, color:'var(--primary)', background:'none', fontSize:'0.8125rem' }}>立即注册</button>
        </div>
      </div>
    </div>
  )
}
