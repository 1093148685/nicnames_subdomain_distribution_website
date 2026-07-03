import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function AdminReservedPrefixesPage() {
  const [prefixes, setPrefixes] = useState<any[]>([])
  const [newPrefix, setNewPrefix] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const fetchPrefixes = async () => {
    setLoading(true)
    try {
      const data = await api.adminGetReservedPrefixes()
      setPrefixes(data.prefixes)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPrefixes() }, [])

  const handleAdd = async () => {
    if (!newPrefix.trim()) return
    setAdding(true)
    try {
      await api.adminAddReservedPrefix(newPrefix.trim().toLowerCase())
      showToast(`保留前缀 "${newPrefix.trim()}" 已添加`, 'success')
      setNewPrefix('')
      fetchPrefixes()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number, prefix: string) => {
    if (!confirm(`确认移除保留前缀 "${prefix}"？`)) return
    try {
      await api.adminDeleteReservedPrefix(id)
      showToast(`前缀 "${prefix}" 已移除`, 'success')
      fetchPrefixes()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">管理保留前缀 — 这些前缀不能被用户认领</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>添加保留前缀</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          输入要保留的前缀（如 "admin"、"www"），用户无法认领以此开头的子域名。
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="input" placeholder="输入前缀..." value={newPrefix}
            onChange={e => setNewPrefix(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newPrefix.trim()}>
            {adding ? '添加中...' : '添加'}
          </button>
        </div>
      </div>

      {prefixes.length === 0 ? (
        <div className="empty-state"><p>暂无保留前缀</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>前缀</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {prefixes.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{p.id}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.prefix}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id, p.prefix)}>删除</button>
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
