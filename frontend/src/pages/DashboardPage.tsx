import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ domains: 0, records: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMySubdomains().then(data => {
      const recordsCount = data.subdomains.reduce((sum: number, d: any) => sum + (d.records_count || 0), 0)
      setStats({ domains: data.subdomains.length, records: recordsCount })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const copyInvite = () => {
    navigator.clipboard.writeText(`https://REDACTED.example.com/invite/${user?.username}`)
    showToast('邀请链接已复制', 'success')
  }

  if (loading) {
    return (
      <div className="loading-stack">
        <div className="skeleton skeleton-line" style={{ width: '220px', height: 18 }} />
        <div className="stats-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton" style={{ height: 118, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="stagger-list">
      <p className="page-desc">欢迎回来，{user?.username}。在这里快速查看域名、DNS 记录和积分状态。</p>

      {stats.domains === 0 ? (
        <div className="card empty-state" style={{ marginBottom:'1.5rem' }}>
          <div className="empty-state-icon"><GlobeIcon /></div>
          <h3 className="empty-state-title">还没有域名</h3>
          <p className="empty-state-desc">立即注册第一个免费子域名，并开始管理 DNS 记录。</p>
          <div className="empty-state-action">
            <button className="btn btn-primary" onClick={() => navigate('/register')}>立即注册域名</button>
          </div>
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard tone="credits" icon={<CreditsIcon />} value={user?.credits ?? 0} label="积分余额" link="/credits" />
        <StatCard tone="domains" icon={<GlobeIcon />} value={stats.domains} label="我的域名" link="/my-domains" />
        <StatCard tone="records" icon={<ListIcon />} value={stats.records} label="DNS 记录" link="/my-domains" />
      </div>

      <div className="card" style={{ marginTop:'1.5rem' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.5rem' }}>邀请好友</h3>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>
          分享你的邀请链接，好友注册并完成验证后，双方都可以获得积分奖励。
        </p>
        <div className="invite-box">
          <code className="invite-code">https://REDACTED.example.com/invite/{user?.username}</code>
          <button className="btn btn-primary btn-sm" onClick={copyInvite}>复制</button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label, link, tone }: { icon: React.ReactNode; value: number; label: string; link: string; tone: 'credits' | 'domains' | 'records' }) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className={`stat-card-icon ${tone}`}>{icon}</div>
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label"><Link to={link} style={{ color:'inherit' }}>{label} →</Link></div>
      <div className="stat-card-sparkline">
        <svg width="100%" height="20" viewBox="0 0 100 20" aria-hidden="true">
          <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points="0,15 20,12 40,16 60,8 80,10 100,4" opacity="0.42" />
        </svg>
      </div>
    </div>
  )
}

function CreditsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><path d="M8 9.5h4.5a2 2 0 0 1 0 4H8M11 13.5V16"/></svg> }
function GlobeIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }
function ListIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> }
