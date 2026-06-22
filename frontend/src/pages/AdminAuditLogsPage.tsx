import { useState, useEffect } from 'react'
import { api } from '../api'

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = async (q?: string) => {
    setLoading(true)
    try {
      const data = await api.adminGetAuditLogs(q ? { search: q } : undefined)
      setLogs(data.logs)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [])

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">查看系统中记录的所有管理员操作。</p>

      <div className="search-bar">
        <input className="input" placeholder="按操作、资源或详情搜索..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLogs(search)} />
        <button className="btn btn-primary btn-sm" onClick={() => fetchLogs(search)}>搜索</button>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state"><p>暂无审计日志</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>用户</th>
                <th>操作</th>
                <th>资源</th>
                <th>详情</th>
                <th>IP</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{log.id}</td>
                  <td style={{ fontSize: '0.8125rem' }}>{log.username || log.user_id || '-'}</td>
                  <td>
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8125rem' }}>{log.resource_type || '-'}</td>
                  <td style={{
                    fontSize: '0.8125rem',
                    maxWidth: '200px',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                  }}>
                    {typeof log.details === 'object'
                      ? JSON.stringify(log.details)
                      : log.details || '-'
                    }
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {log.ip || '-'}
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
