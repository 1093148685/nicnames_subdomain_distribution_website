import { useState, type FormEvent } from 'react';
import { useAuth } from '../AuthContext';

interface Props {
  open: boolean;
  defaultMode: 'signin' | 'signup';
  onClose: () => void;
}

export default function AuthModal({ open, defaultMode, onClose }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState(defaultMode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign In fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sign Up fields
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  if (!open) return null;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signIn(username, password);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signUp({ username: regUsername, email: regEmail, password: regPassword, invite_code: inviteCode || undefined });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-tabs">
          <button className={`modal-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setError(''); }}>登录</button>
          <button className={`modal-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>注册</button>
        </div>

        <h2>{mode === 'signin' ? '欢迎回来' : '创建账号'}</h2>
        <p className="modal-subtitle">
          {mode === 'signin' ? '登录管理你的域名和 DNS 记录' : '几分钟即可拥有你的子域名'}
        </p>

        {error && <div className="form-error">{error}</div>}

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label>用户名或邮箱</label>
              <input className="form-input" type="text" placeholder="输入用户名或邮箱"
                value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input className="form-input" type="password" placeholder="输入密码"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-glow" disabled={loading}><span>{loading ? '登录中...' : '登录'}</span></button>
            </div>
            <div className="form-footer">
              还没有账号？<button type="button" onClick={switchMode}>立即注册</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label>用户名</label>
              <input className="form-input" type="text" placeholder="你的用户名"
                value={regUsername} onChange={e => setRegUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>邮箱</label>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input className="form-input" type="password" placeholder="至少 6 位密码"
                value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="form-group">
              <label>邀请码（可选）</label>
              <input className="form-input" type="text" placeholder="如有邀请码请填写"
                value={inviteCode} onChange={e => setInviteCode(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-glow" disabled={loading}><span>{loading ? '注册中...' : '注册'}</span></button>
            </div>
            <div className="form-footer">
              已有账号？<button type="button" onClick={switchMode}>去登录</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
