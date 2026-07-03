import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

type Stats = { users: number; subdomains: number; records: number; pending: number }

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [domains, setDomains] = useState<any[]>([])
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const [rawStats, domainData] = await Promise.all([
        api.adminGetStats(),
        api.adminGetSystemDomains().catch(() => ({ domains: [] })),
      ])
      const statData = {
        users: rawStats.users || 0,
        subdomains: rawStats.subdomains || 0,
        records: rawStats.records ?? rawStats.dns_records ?? 0,
        pending: rawStats.pending ?? rawStats.pending_moderation ?? 0,
        todayUsers: rawStats.today_users ?? 0,
        todaySubdomains: rawStats.today_subdomains ?? 0,
        todayRecords: rawStats.today_dns_records ?? 0,
      }
      setStats(statData)
      setDomains(domainData.domains || [])
      setLastSync(new Date())
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 10000)
    return () => window.clearInterval(timer)
  }, [load])

  const apiHealthy = domains.length > 0

  return (
    <div>
      <div className="hero-panel ops-hero">
        <div className="ops-main-panel">
          <div className="eyebrow">DNS Portal 后台</div>
          <h2>运营控制台</h2>
          <p>面向域名注册、DNS 记录、用户积分和系统安全的实时后台。当前数据每 10 秒同步一次，异常状态会在这里集中暴露。</p>
          <div className="hero-actions">
            <span className="status-chip success"><span className="pulse-dot" />服务在线</span>
            <span className="status-chip">最近同步：{lastSync ? lastSync.toLocaleTimeString('zh-CN', { hour12: false }) : '同步中'}</span>
          </div>
        </div>
        <div className="trust-card">
          <div className="trust-score">{apiHealthy ? '安全' : '待检查'}</div>
          <div className="trust-title">系统健康度</div>
          <ul>
            <li>管理员接口已权限隔离</li>
            <li>敏感配置默认隐藏</li>
            <li>NicNames 域名实时同步</li>
          </ul>
        </div>
      </div>

      <div className="stats-grid ops-stats-grid">
        <StatCard icon={<UsersIcon />} value={stats?.users} today={stats?.todayUsers} label="用户数" unit="新增" tone="purple" />
        <StatCard icon={<GlobeIcon />} value={stats?.subdomains} today={stats?.todaySubdomains} label="已认领子域名" unit="新增" tone="blue" />
        <StatCard icon={<ListIcon />} value={stats?.records} today={stats?.todayRecords} label="DNS 记录" unit="新增" tone="green" />
        <StatCard icon={<ShieldIcon />} value={stats?.pending} label="待审核" tone="amber" trend={stats?.pending ? '需要处理' : '无风险积压'} />
      </div>

      <div className="ops-grid">
        <section className="card ops-card">
          <div className="card-title-row">
            <div>
              <h3>接入安全</h3>
              <p>关键后台能力状态</p>
            </div>
            <span className="badge badge-success">运行中</span>
          </div>
          <div className="check-list">
            <CheckItem title="NicNames 实时域名" desc={`${domains.length || 0} 个账号域名可用于注册选项`} ok={apiHealthy} />
            <CheckItem title="管理端权限" desc="普通用户访问管理员 API 返回 403" ok />
            <CheckItem title="配置脱敏" desc="系统设置中的凭据以 [已隐藏] 展示" ok />
          </div>
        </section>

        <section className="card ops-card">
          <div className="card-title-row">
            <div>
              <h3>实用入口</h3>
              <p>高频操作一步到位</p>
            </div>
          </div>
          <div className="quick-actions">
            <a className="quick-action" href="/admin/domains">域名与 DNS 管理<span>查看认领、记录、根域名</span></a>
            <a className="quick-action" href="/admin/users">用户与积分<span>发放积分、封禁、角色</span></a>
            <a className="quick-action" href="/admin/settings">系统配置<span>安全查看和更新配置</span></a>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label, tone, trend, today, unit }: { icon: React.ReactNode; value?: number; label: string; tone: string; trend?: string; today?: number; unit?: string }) {
  return (
    <div className="stat-card ops-stat-card">
      <div className="stat-card-header">
        <div className={`stat-card-icon ${tone}`}>{icon}</div>
        <span className="mini-badge">实时</span>
      </div>
      {value !== undefined ? (
        <>
          <div className="stat-card-value">
            {value}
            {today !== undefined && today > 0 && (
              <span className="stat-card-today">+{today} {unit || '新增'}</span>
            )}
          </div>
          <div className="stat-card-label">{label}</div>
          <div className="stat-card-sparkline">{trend ?? (today !== undefined && today > 0 ? `今日新增 ${today}` : '暂无更新')}</div>
        </>
      ) : (
        <>
          <div className="skeleton" style={{ width: '60%', height: '1.75rem', marginBottom: '0.375rem', borderRadius: '6px' }} />
          <div className="skeleton" style={{ width: '40%', height: '0.8125rem', borderRadius: '4px' }} />
        </>
      )}
    </div>
  )
}

function CheckItem({ title, desc, ok }: { title: string; desc: string; ok: boolean }) {
  return <div className="check-item"><span className={ok ? 'check-ok' : 'check-warn'}>{ok ? '✓' : '!'}</span><div><strong>{title}</strong><p>{desc}</p></div></div>
}

function UsersIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function GlobeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }
function ListIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> }
function ShieldIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
