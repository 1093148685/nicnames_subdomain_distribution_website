import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

type DomainsTab = 'claimed' | 'records' | 'domains'

export default function AdminDomainsPage() {
  const [activeTab, setActiveTab] = useState<DomainsTab>('claimed')

  const tabs: { key: DomainsTab; label: string }[] = [
    { key: 'claimed', label: '已认领' },
    { key: 'records', label: 'DNS 记录' },
    { key: 'domains', label: '根域名' },
  ]

  return (
    <div>
      <p className="page-desc">管理已认领的子域名、DNS 记录和根域名</p>

      <div className="pill-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`pill-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'claimed' && <ClaimedTab />}
      {activeTab === 'records' && <RecordsTab />}
      {activeTab === 'domains' && <SystemDomainsTab />}
    </div>
  )
}

/* ─── Claimed Subdomains Tab ────────────────────────── */

function ClaimedTab() {
  const [subdomains, setSubdomains] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchSubdomains = async (q?: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.adminGetAllSubdomains(q ? { search: q } : undefined)
      setSubdomains(data.subdomains)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubdomains()
    const timer = window.setInterval(() => fetchSubdomains(search, true), 12000)
    return () => window.clearInterval(timer)
  }, [search])

  const handleRelease = async (id: number, domain: string) => {
    if (!confirm(`确认释放子域名 "${domain}"？这将删除所有 DNS 记录。`)) return
    try {
      await api.adminReleaseSubdomain(id)
      showToast(`已释放 ${domain}`, 'success')
      fetchSubdomains(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div className="search-bar">
        <input className="input" placeholder="搜索子域名、用户或邮箱..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchSubdomains(search)} />
        <button className="btn btn-primary btn-sm" onClick={() => fetchSubdomains(search)}>搜索</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>子域名</th>
              <th>根域名</th>
              <th>所有者</th>
              <th>记录数</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {subdomains.map(s => (
              <tr key={s.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{s.id}</td>
                <td style={{ fontWeight: 600 }}>{s.domain}</td>
                <td>{s.root_domain}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.owner_username || s.username || '-'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.owner_email || s.email || `用户ID：${s.user_id || '-'}`}</div>
                </td>
                <td><span className="badge badge-primary">{s.records_count || 0}</span></td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRelease(s.id, s.domain)}>释放</button>
                </td>
              </tr>
            ))}
            {subdomains.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无子域名</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─── DNS Records Tab ───────────────────────────────── */

function RecordsTab() {
  const [records, setRecords] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchRecords = async (q?: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.adminGetAllRecords(q ? { search: q } : undefined)
      setRecords(data.records)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    const timer = window.setInterval(() => fetchRecords(search, true), 12000)
    return () => window.clearInterval(timer)
  }, [search])

  const handleDelete = async (id: number) => {
    if (!confirm('删除这条 DNS 记录？')) return
    try {
      await api.adminDeleteRecord(id)
      showToast('记录已删除', 'success')
      fetchRecords(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div className="search-bar">
        <input className="input" placeholder="搜索记录域名、所属子域名、内容或所有者..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchRecords(search)} />
        <button className="btn btn-primary btn-sm" onClick={() => fetchRecords(search)}>搜索</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>记录</th>
              <th>完整解析域名</th>
              <th>内容</th>
              <th>所属子域名</th>
              <th>所有者</th>
              <th>TTL</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{r.id}</td>
                <td>
                  <span className="badge badge-primary">{r.type}</span>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem', marginTop: 4 }}>{r.name || '@'}</div>
                </td>
                <td>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-all' }}>
                    {r.record_fqdn || (r.name === '@' ? r.subdomain_fqdn : `${r.name}.${r.subdomain_fqdn}`) || '-'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>记录ID：{r.id} · 子域名ID：{r.subdomain_id}</div>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', wordBreak: 'break-all', maxWidth: '220px' }}>
                  {r.content}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.subdomain_fqdn || r.subdomain || r.subdomain_name || '-'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    前缀：{r.subdomain_prefix || '-'} · 根域名：{r.root_domain || '-'}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.owner_username || '-'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.owner_email || '-'}</div>
                </td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.ttl}s</td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>删除</button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─── System Domains Tab ────────────────────────────── */

function SystemDomainsTab() {
  const [domains, setDomains] = useState<any[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [pauseReason, setPauseReason] = useState('')

  const fetchDomains = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.adminGetSystemDomains()
      setDomains(data.domains)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDomains()
    const timer = window.setInterval(() => fetchDomains(true), 15000)
    return () => window.clearInterval(timer)
  }, [])

  const handleAdd = async () => {
    if (!newDomain.trim()) return
    setAdding(true)
    try {
      await api.adminAddSystemDomain(newDomain.trim())
      showToast(`已添加域名 ${newDomain.trim()}`, 'success')
      setNewDomain('')
      fetchDomains()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: number, domain: string) => {
    if (!confirm(`确认删除域名 "${domain}"？`)) return
    try {
      await api.adminRemoveSystemDomain(id)
      showToast(`已删除 ${domain}`, 'success')
      fetchDomains()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleToggleDistribution = async (domain: any) => {
    const name = domain.name || domain.domain
    const nextPaused = !domain.paused
    const reason = nextPaused ? (pauseReason.trim() || '管理员暂停分发') : ''
    if (nextPaused && !confirm(`暂停 ${name} 的二级域名分发？用户注册列表将不再显示该根域名。`)) return
    try {
      await api.adminUpdateDomainDistribution(domain.id, { paused: nextPaused, reason })
      showToast(nextPaused ? `已暂停 ${name} 分发` : `已恢复 ${name} 分发`, 'success')
      setPauseReason('')
      fetchDomains()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>添加根域名</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          当前列表来自 NicNames 实时域名清单；可对单个根域名暂停二级域名分发，用户注册页会立即隐藏。
        </p>
        <div className="admin-domain-toolbar">
          <input className="input" placeholder="兜底根域名，例如：example.com" value={newDomain}
            onChange={e => setNewDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newDomain.trim()}>
            {adding ? '添加中...' : '添加兜底域名'}
          </button>
          <input className="input" placeholder="暂停原因（可选）" value={pauseReason} onChange={e => setPauseReason(e.target.value)} />
        </div>
      </div>

      {domains.length === 0 ? (
        <div className="empty-state"><p>暂无根域名</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>域名</th>
                <th>来源</th>
                <th>有效期</th>
                <th>分发状态</th>
                <th>说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {domains.map(d => (
                <tr key={d.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{d.id}</td>
                  <td style={{ fontWeight: 600 }}>{d.name || d.domain}</td>
                  <td><span className="badge badge-primary">{d.source === 'nicnames' ? 'NicNames' : '本地配置'}</span></td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {d.expiry || (d.created_at ? new Date(d.created_at).toLocaleDateString() : '-')}
                  </td>
                  <td>
                    <span className={`badge ${d.paused ? 'badge-danger' : 'badge-primary'}`}>
                      {d.paused ? '已暂停' : '分发中'}
                    </span>
                    {d.paused && d.pause_reason && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{d.pause_reason}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>平台只负责 DNS 分发；HTTPS 由用户自己的网站/CDN/服务器配置。</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className={d.paused ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => handleToggleDistribution(d)}>
                        {d.paused ? '恢复分发' : '暂停分发'}
                      </button>
                      {d.source === 'nicnames' ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', alignSelf: 'center' }}>账号域名</span>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemove(d.id, d.name || d.domain)}>删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
function PageSkeleton() {
  return (
    <div className="loading-stack">
      <div className="skeleton skeleton-line" style={{ width: '220px', height: 18 }} />
      <div className="skeleton skeleton-table" />
      <div className="skeleton skeleton-table" />
      <div className="skeleton skeleton-table" />
    </div>
  )
}
