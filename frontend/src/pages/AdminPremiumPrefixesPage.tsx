import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function AdminPremiumPrefixesPage() {
  const [prefixes, setPrefixes] = useState<any[]>([])
  const [newPrefix, setNewPrefix] = useState('')
  const [newMultiplier, setNewMultiplier] = useState('1.0')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const fetchPrefixes = async () => {
    setLoading(true)
    try {
      const data = await api.adminGetPremiumPrefixes()
      setPrefixes(data.prefixes)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPrefixes() }, [])

  const handleAdd = async () => {
    if (!newPrefix.trim()) return
    const mult = parseFloat(newMultiplier)
    if (isNaN(mult) || mult <= 0) {
      showToast('价格倍率必须为正数', 'error')
      return
    }
    setAdding(true)
    try {
      await api.adminAddPremiumPrefix(newPrefix.trim().toLowerCase(), mult)
      showToast(`高级前缀 "${newPrefix.trim()}" 已添加（×${mult}）`, 'success')
      setNewPrefix('')
      setNewMultiplier('1.0')
      fetchPrefixes()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number, prefix: string) => {
    if (!confirm(`确认移除高级前缀 "${prefix}"？`)) return
    try {
      await api.adminDeletePremiumPrefix(id)
      showToast(`高级前缀 "${prefix}" 已移除`, 'success')
      fetchPrefixes()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">管理高级前缀 — 使用这些前缀需要额外积分倍率</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>添加高级前缀</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          输入前缀和价格倍率。2.0 表示价格为基价的 2 倍。
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input className="input" placeholder="输入前缀..." value={newPrefix}
            onChange={e => setNewPrefix(e.target.value)}
            style={{ flex: '1', minWidth: '160px' }} />
          <input className="input" type="number" step="0.1" min="0.1" placeholder="倍率（如 2.0）"
            value={newMultiplier} onChange={e => setNewMultiplier(e.target.value)}
            style={{ width: '180px' }} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newPrefix.trim()}>
            {adding ? '添加中...' : '添加'}
          </button>
        </div>
      </div>

      {prefixes.length === 0 ? (
        <div className="empty-state"><p>暂无高级前缀</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Prefix</th>
                <th>价格倍率</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prefixes.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{p.id}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.prefix}</td>
                  <td><span className="badge badge-warning">×{p.price_multiplier}</span></td>
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
