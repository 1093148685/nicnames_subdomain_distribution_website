import { useEffect, useState } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

type ShowcaseItem = {
  id: number
  site_name: string
  site_url: string
  owner_name?: string
  avatar_url?: string
  reason?: string
  status: string
  created_at?: string
}

function cleanDescription(reason?: string) {
  return (reason || '')
    .replace(/^类型：站点展示申请\n说明：/, '')
    .split('\n联系方式：')[0]
    .split('\n提交 IP：')[0]
    .trim()
}

const emptyForm = { site_name: '', site_url: '', owner_name: '', avatar_url: '', description: '', status: 'approved' }

export default function AdminShowcaseSitesPage() {
  const [items, setItems] = useState<ShowcaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ShowcaseItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadItems = async () => {
    setLoading(true)
    try {
      const data = await api.adminGetShowcaseSites()
      setItems(data.items || [])
    } catch (err: any) {
      showToast(err.message || '站点展示列表加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item: ShowcaseItem) => {
    setEditing(item)
    setForm({
      site_name: item.site_name || '',
      site_url: item.site_url || '',
      owner_name: item.owner_name || '',
      avatar_url: item.avatar_url || '',
      description: cleanDescription(item.reason),
      status: item.status || 'approved',
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.site_name.trim()) return showToast('请填写站点名称', 'error')
    if (!form.site_url.trim()) return showToast('请填写站点 URL', 'error')
    if (form.description.trim().length < 2) return showToast('请填写站点介绍', 'error')
    setSaving(true)
    try {
      if (editing) {
        await api.adminUpdateShowcaseSite(editing.id, form)
        showToast('站点展示已更新', 'success')
      } else {
        await api.adminCreateShowcaseSite(form)
        showToast('站点展示已新增', 'success')
      }
      setModalOpen(false)
      loadItems()
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ShowcaseItem) => {
    if (!confirm(`确定删除「${item.site_name || item.site_url}」吗？`)) return
    try {
      await api.adminDeleteShowcaseSite(item.id)
      showToast('已删除', 'success')
      loadItems()
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error')
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <p className="page-desc">管理公开「优质站点」展示墙。可新增、编辑、删除，并控制是否公开展示。</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>新增站点</button>
      </div>

      {loading ? <PageSkeleton /> : items.length === 0 ? (
        <div className="empty-state">
          <p>暂无站点展示数据</p>
          <button className="btn btn-primary" onClick={openCreate}>新增站点</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>站点</th>
                <th>所属用户</th>
                <th>头像</th>
                <th>介绍</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{item.id}</td>
                  <td style={{ minWidth: 220 }}>
                    <strong>{item.site_name}</strong><br />
                    <a href={item.site_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>{item.site_url}</a>
                  </td>
                  <td style={{ minWidth: 120, fontSize: '0.875rem' }}>{item.owner_name || '@dns.ccocc'}</td>
                  <td>
                    <img src={item.avatar_url || ''} alt={item.site_name} style={{ width: 34, height: 34, borderRadius: 999, objectFit: 'cover', background: 'var(--surface-muted)' }} />
                  </td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8125rem' }}>{cleanDescription(item.reason) || '-'}</td>
                  <td>
                    <span className={`badge ${item.status === 'approved' ? 'badge-success' : item.status === 'pending' ? 'badge-primary' : 'badge-warning'}`}>
                      {item.status === 'approved' ? '展示中' : item.status === 'pending' ? '待审核' : '已驳回'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>编辑</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(item)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal report-modal">
            <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            <h2>{editing ? '编辑站点展示' : '新增站点展示'}</h2>
            <div className="form-group">
              <label>站点名称</label>
              <input className="input" value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })} placeholder="例如：个人博客" />
            </div>
            <div className="form-group">
              <label>站点 URL</label>
              <input className="input" value={form.site_url} onChange={e => setForm({ ...form, site_url: e.target.value })} placeholder="https://example.ccocc.cyou" />
            </div>
            <div className="form-group">
              <label>所属用户名</label>
              <input className="input" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="不填默认 @dns.ccocc" />
            </div>
            <div className="form-group">
              <label>头像 URL</label>
              <input className="input" value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="不填使用系统设置里的默认头像" />
            </div>
            <div className="form-group">
              <label>站点介绍</label>
              <textarea className="input" rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="展示在公开页面卡片上的介绍" />
            </div>
            <div className="form-group">
              <label>状态</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="approved">展示中</option>
                <option value="pending">待审核</option>
                <option value="rejected">已驳回</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModalOpen(false)} disabled={saving}>取消</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
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
    </div>
  )
}
