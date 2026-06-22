import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { SiteLogo } from './SiteLogo'

const navItems = [
  { to: '/dashboard', label: '仪表盘', icon: DashboardIcon },
  { to: '/register', label: '注册域名', icon: RegisterIcon },
  { to: '/domain-search', label: '官网搜索', icon: SearchIcon },
  { to: '/my-domains', label: '我的域名', icon: GlobeIcon },
  { to: '/invite', label: '邀请好友', icon: InviteIcon },
  { to: '/credits', label: '积分中心', icon: CreditsIcon },
  { to: '/activity', label: '活动记录', icon: ActivityIcon },
  { to: '/api-keys', label: 'API 管理', icon: ApiIcon },
  { to: '/developer', label: '开发者奖励', icon: DeveloperIcon },
  { to: '/settings', label: '账号设置', icon: SettingsIcon },
]

const adminItems = [
  { to: '/admin', label: '管理概览', icon: OverviewIcon },
  { to: '/admin/users', label: '用户管理', icon: UsersIcon },
  { to: '/admin/domains', label: '域名管理', icon: GlobeIcon },
  { to: '/admin/reserved-prefixes', label: '保留前缀', icon: LockIcon },
  { to: '/admin/premium-prefixes', label: '高级前缀', icon: CrownIcon },
  { to: '/admin/moderation', label: '审核管理', icon: ShieldIcon },
  { to: '/admin/showcase-sites', label: '站点展示', icon: StarIcon },
  { to: '/admin/audit-logs', label: '审计日志', icon: ActivityIcon },
  { to: '/admin/fingerprints', label: '设备指纹', icon: FingerprintIcon },
  { to: '/admin/settings', label: '系统设置', icon: SettingsIcon },
]

export default function Sidebar({ open, onClose, onSignOut }: { open: boolean; onClose: () => void; onSignOut: () => void }) {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:99 }} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <SiteLogo className="site-logo-img sidebar-logo-img" />
          <span>DNS.ccocc</span>
          <button className="modal-close" onClick={onClose} style={{ marginLeft:'auto', display:'none' }}>✕</button>
        </div>
        <nav className="sidebar-nav">
          <p className="section-label">导航</p>
          {navItems.map(item => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            return (
              <Link key={item.to} to={item.to} className={`sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                <item.icon />
                {item.label}
              </Link>
            )
          })}
          {user?.role === 'admin' && (
            <>
              <p className="section-label" style={{ marginTop: '0.5rem' }}>管理</p>
              {adminItems.map(item => {
                const isActive = item.to === '/admin'
                  ? location.pathname === '/admin'
                  : location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                return (
                  <Link key={item.to} to={item.to} className={`sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <item.icon />
                    {item.label}
                  </Link>
                )
              })}
            </>
          )}
        </nav>
        {user && (
          <div className="sidebar-bottom">
            <button className="sidebar-link logout" onClick={onSignOut} style={{ width:'100%', border:'none', background:'none', cursor:'pointer', textAlign:'left' }}>
              <LogoutIcon />
              退出登录
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function DashboardIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function RegisterIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg> }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M8 11h6"/></svg> }
function GlobeIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }
function InviteIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg> }
function CreditsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 9.5h4.5a2 2 0 0 1 0 4H8M11 13.5V16"/></svg> }
function ActivityIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> }
function ApiIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> }
function DeveloperIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function SettingsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> }
function LogoutIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function OverviewIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="8" height="8" rx="2"/><rect x="14" y="14" width="8" height="8" rx="2"/></svg> }
function UsersIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function LockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function CrownIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></svg> }
function StarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3 12 2"/></svg> }
function ShieldIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function FingerprintIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 0-10 10v3"/><path d="M22 12c0-4.42-2.23-8.18-5.6-10.41"/><path d="M2 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-7a5 5 0 0 1 10 0v7a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2"/><circle cx="12" cy="14" r="2"/></svg> }
