import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { SiteLogo } from './SiteLogo'

interface PublicHeaderProps {
  onSignIn: () => void
  onSignUp: () => void
}

export default function PublicHeader({ onSignIn, onSignUp }: PublicHeaderProps) {
  const { user } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark' : ''
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  const isActive = (path: string) => location.pathname === path ? 'active' : ''
  const navLinks = [
    ['/available-domains', '可用域名'],
    ['/domain-search', '官网搜索'],
    ['/whois', 'WHOIS'],
    ['/knowledge-base', '知识库'],
    ['/featured-sites', '优质站点'],
    ['/sitemap', '站点地图'],
  ]

  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link to="/" className="public-header-logo">
          <SiteLogo className="site-logo-img public-logo-img" />
          <span>DNS.ccocc</span>
        </Link>

        <nav className={`public-header-nav${menuOpen ? ' open' : ''}`}>
          {navLinks.map(([to, label]) => <Link key={to} to={to} className={isActive(to)}>{label}</Link>)}
        </nav>

        <div className="public-header-actions">
          <button onClick={toggleTheme} className="theme-toggle public-theme-toggle" title="切换夜晚模式" aria-label="切换夜晚模式">
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            )}
          </button>

          {user ? (
            <Link to="/dashboard" className="btn btn-primary">控制台</Link>
          ) : (
            <>
              <button className="btn btn-ghost public-auth-btn" onClick={onSignIn}>登录</button>
              <button className="btn btn-primary public-auth-btn" onClick={onSignUp}>注册</button>
            </>
          )}
          <button className="public-menu-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="展开导航">
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  )
}
