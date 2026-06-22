import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function AdminModerationPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Record<number, boolean>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [rejectItem, setRejectItem] = useState<any | null>(null)

  const fetchItems = async () => {
    setLoading(true)
    try {
      const data = await api.adminGetModeration()
      setItems(data.items)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const handleApprove = async (item: any) => {
    setProcessing(prev => ({ ...prev, [item.id]: true }))
    try {
      await api.adminApproveModeration(item.id)
      showToast('已通过', 'success')
      fetchItems()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setProcessing(prev => ({ ...prev, [item.id]: false }))
    }
  }

  const handleRejectConfirm = async () => {
    if (!rejectItem) return
    setProcessing(prev => ({ ...prev, [rejectItem.id]: true }))
    try {
      await api.adminRejectModeration(rejectItem.id, rejectReason || undefined)
      showToast('已驳回', 'success')
      setRejectItem(null)
      setRejectReason('')
      fetchItems()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setProcessing(prev => ({ ...prev, [rejectItem.id]: false }))
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">审核滥用举报和站点展示申请</p>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>暂无待审核项</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>类型</th>
                <th>举报人 / 用户</th>
                <th>内容</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{item.id}</td>
                  <td>
                    <span className={`badge ${item.type === 'abuse' ? 'badge-warning' : 'badge-primary'}`}>
                      {item.type === 'abuse' ? '滥用举报' : '站点展示'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8125rem' }}>{item.reporter_name || item.username || item.user_id || '公开提交'}</td>
                  <td style={{ fontSize: '0.8125rem', maxWidth: '320px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    <strong>{item.site_name || '-'}</strong>
                    {item.site_url && <><br /><a href={item.site_url} target="_blank" rel="noreferrer">{item.site_url}</a></>}
                    {item.reason && <><br />{item.reason}</>}
                  </td>
                  <td>
                    <span className={`badge ${
                      item.status === 'approved' ? 'badge-success' :
                      item.status === 'rejected' ? 'badge-warning' :
                      'badge-primary'
                    }`}>
                      {item.status || 'pending'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    {item.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => handleApprove(item)}
                          disabled={processing[item.id]}>
                          {processing[item.id] ? '...' : '通过'}
                        </button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => setRejectItem(item)}
                          disabled={processing[item.id]}>
                          驳回
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      {rejectItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRejectItem(null)}>
          <div className="modal">
            <button className="modal-close" onClick={() => { setRejectItem(null); setRejectReason('') }}>✕</button>
            <h2>驳回</h2>
            <p>输入驳回原因（可选）</p>
            <div className="form-group">
              <label>原因</label>
              <textarea className="input" rows={3} placeholder="Enter rejection reason..." value={rejectReason}
                onChange={e => setRejectReason(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setRejectItem(null); setRejectReason('') }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleRejectConfirm}
                disabled={processing[rejectItem.id]}>
                {processing[rejectItem.id] ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
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
