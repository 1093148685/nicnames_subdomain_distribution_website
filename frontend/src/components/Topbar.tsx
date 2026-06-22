import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../AuthContext'

interface TopbarProps {
  title: string
  onToggleSidebar: () => void
}

function apiFetch(path: string) {
  const token = localStorage.getItem('token')
  return fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then(async res => {
    if (!res.ok) throw new Error('请求失败')
    return res.json()
  })
}

export default function Topbar({ title, onToggleSidebar }: TopbarProps) {
  const { user, credits, refreshUser } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'zh')
  const [lastSync, setLastSync] = useState(new Date())
  const [syncing, setSyncing] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('lang', lang)
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  useEffect(() => {
    if (!user) return
    const run = async () => {
      try {
        setSyncing(true)
        await refreshUser()
        setLastSync(new Date())
      } finally {
        setSyncing(false)
      }
    }
    const timer = window.setInterval(run, 15000)
    return () => window.clearInterval(timer)
  }, [user, refreshUser])

  // 轮询未读通知数
  useEffect(() => {
    if (!user || user.role !== 'admin') return
    const fetchUnread = async () => {
      try {
        const data = await apiFetch('/api/admin/notifications/unread-count') as { count: number }
        setUnreadCount(data.count)
      } catch {}
    }
    fetchUnread()
    const timer = window.setInterval(fetchUnread, 15000)
    return () => window.clearInterval(timer)
  }, [user])

  // 打开通知面板
  const openNotifPanel = useCallback(async () => {
    setShowNotifPanel(v => !v)
    if (!showNotifPanel) {
      try {
        const data = await apiFetch('/api/admin/notifications') as { notifications: any[] }
        setNotifications(data.notifications || [])
      } catch {}
    }
  }, [showNotifPanel])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  const toggleLang = () => setLang(l => (l === 'zh' ? 'en' : 'zh'))
  const userInitial = user?.username?.charAt(0)?.toUpperCase() || '?'
  const syncText = syncing ? '同步中' : `${lastSync.toLocaleTimeString('zh-CN', { hour12: false })} 更新`

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <button className="hamburger" onClick={onToggleSidebar} aria-label="切换侧边栏">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div>
            <h1 className="topbar-title">{title}</h1>
            <div className="topbar-subtitle">实时安全控制台 · {syncText}</div>
          </div>
        </div>

        <div className="topbar-actions">
          {user?.role === 'admin' && <a className="btn btn-outline btn-sm topbar-front-link" href="/" target="_blank" rel="noreferrer">前台</a>}
          <span className="ops-status-pill"><span className="pulse-dot" />系统正常</span>
          {user && (
            <span className="topbar-credits" title="积分">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8" />
              </svg>
              {credits}
            </span>
          )}
          <button className="notification-toggle" title="通知" aria-label="通知" onClick={openNotifPanel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button className="lang-switch" onClick={toggleLang} title="切换语言">{lang === 'zh' ? '中' : 'En'}</button>
          <button className="theme-toggle" onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>}
          </button>
          {user && <div className="user-avatar" title={user.username}>{userInitial}</div>}
        </div>
      </div>

      {/* 通知面板 */}
      {showNotifPanel && (
        <div className="notif-panel-overlay" onClick={() => setShowNotifPanel(false)}>
          <div className="notif-panel" onClick={e => e.stopPropagation()}>
            <div className="notif-panel-header">
              <h3>后台通知</h3>
              <button className="notif-panel-close" onClick={() => setShowNotifPanel(false)}>✕</button>
            </div>
            <div className="notif-panel-body">
              {notifications.length === 0 ? (
                <div className="notif-empty">暂无通知</div>
              ) : (
                notifications.map((n: any) => (
                  <div key={n.id} className="notif-item">
                    <div className="notif-item-title">{n.title}</div>
                    <div className="notif-item-content">{n.content}</div>
                    <div className="notif-item-time">
                      {n.created_at ? new Date(n.created_at).toLocaleString('zh-CN') : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
