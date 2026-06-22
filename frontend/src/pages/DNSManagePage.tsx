import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { showToast } from '../components/Toast'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA']
const emptyForm = { type: 'A', name: '@', content: '', ttl: 14400 }

export default function DNSManagePage() {
  const { id } = useParams()
  const [subdomain, setSubdomain] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [myDomains, recordsData] = await Promise.all([
        api.getMySubdomains(),
        api.getRecords(Number(id)),
      ])
      const sd = myDomains.subdomains.find((d: any) => d.id === Number(id))
      setSubdomain(sd)
      setRecords(recordsData.records)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id])

  const openAdd = () => {
    setEditingRecord(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (record: any) => {
    setEditingRecord(record)
    setForm({
      type: record.type || 'A',
      name: record.name || '@',
      content: record.content || '',
      ttl: Number(record.ttl || 3600),
    })
    setShowForm(true)
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
    setEditingRecord(null)
    setForm(emptyForm)
  }

  const handleSave = async () => {
    if (!form.content.trim()) return
    setSaving(true)
    try {
      const payload = { type: form.type, name: form.name || '@', content: form.content, ttl: Number(form.ttl || 3600) }
      if (editingRecord) {
        await api.updateRecord(Number(id), editingRecord.id, payload)
        showToast('DNS 记录已修改', 'success')
      } else {
        await api.createRecord(Number(id), payload)
        showToast('DNS 记录已添加', 'success')
      }
      closeForm()
      fetchData()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (recordId: number) => {
    if (!confirm('确定删除这条 DNS 记录？')) return
    try {
      await api.deleteRecord(Number(id), recordId)
      showToast('记录已删除', 'success')
      fetchData()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />
  if (!subdomain) return <p>域名未找到。<Link to="/my-domains">返回我的域名</Link></p>

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' }}>
        <div>
          <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>
            <Link to="/my-domains" style={{ color:'inherit' }}>我的域名</Link> / {subdomain.domain}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 添加记录</button>
      </div>

      <div className="card" style={{ marginBottom:'1rem', padding:'0.75rem 1rem', fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
        名称服务器: <code style={{ fontFamily:'monospace' }}>ns1.ccocc.cyou, ns2.ccocc.cyou</code>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>暂无 DNS 记录</p>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>添加第一条记录</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>内容</th>
                <th>TTL</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td><span className="badge badge-primary">{r.type}</span></td>
                  <td style={{ fontFamily:'monospace', fontSize:'0.8125rem' }}>{r.name}</td>
                  <td style={{ fontFamily:'monospace', fontSize:'0.8125rem', wordBreak:'break-all' }}>{r.content}</td>
                  <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>{r.ttl}s</td>
                  <td>
                    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>修改</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="modal">
            <button className="modal-close" onClick={closeForm}>✕</button>
            <h2>{editingRecord ? '修改 DNS 记录' : '添加 DNS 记录'}</h2>
            <p>{editingRecord ? '修改会同步更新真实 DNS：先删除旧记录，再添加新记录。' : '添加一条新的 DNS 记录'}</p>

            <div className="form-group">
              <label>类型</label>
              <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>名称</label>
              <input className="input" placeholder="@（当前子域名）或 www、api 等" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>内容</label>
              <input className="input" placeholder="IP 地址、域名或文本值" value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })} />
            </div>
            <div className="form-group">
              <label>TTL（秒）</label>
              <input className="input" type="number" min={14400} max={86400} value={form.ttl}
                onChange={e => setForm({ ...form, ttl: Number(e.target.value) })} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closeForm} disabled={saving}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.content.trim()}>
                {saving ? (editingRecord ? '修改中...' : '添加中...') : (editingRecord ? '保存修改' : '添加')}
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
