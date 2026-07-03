import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    api.getMe().then(d => setUser(d.user)).catch(() => {});
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="oklch(55% .236 263)"/>
            <text x="14" y="19" textAnchor="middle" fill="white" fontSize="14" fontWeight="800">D</text>
          </svg>
          <span>DNS Portal</span>
        </Link>
        <div className="navbar-nav">
          <Link to="/domains" className={isActive('/domains')}>可用域名</Link>
          <Link to="/dashboard" className={isActive('/dashboard')}>控制台</Link>
        </div>
        <div className="navbar-actions">
          <button onClick={toggleTheme} className="theme-toggle" style={{ padding: '0.375rem', borderRadius: 'var(--radius)', color: 'var(--text-secondary)' }}>
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            )}
          </button>
          {user ? (
            <Link to="/dashboard" className="btn-primary">控制台</Link>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => navigate('/auth/login')}>登录</button>
              <button className="btn-primary" onClick={() => navigate('/auth/register')}>注册</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
