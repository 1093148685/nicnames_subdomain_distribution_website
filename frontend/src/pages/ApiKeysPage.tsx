import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([])
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchKeys = async () => {
    try {
      const data = await api.getApiKeys()
      setKeys(data.keys)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchKeys() }, [])

  const handleCreate = async () => {
    if (!keyName.trim()) return
    setCreating(true)
    try {
      const data = await api.createApiKey(keyName.trim())
      showToast(`API key created: ${data.key.key}`, 'success')
      setKeyName('')
      fetchKeys()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此 API key？删除后不可恢复。')) return
    try {
      await api.deleteApiKey(id)
      showToast('API key 已删除', 'success')
      fetchKeys()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    showToast('Key 已复制', 'success')
  }

  if (loading) return <PageSkeleton />

  return (
    <div style={{ maxWidth:'40rem' }}>
      <p className="page-desc">创建 API key，通过公共 API 以编程方式管理你的域名 DNS。</p>

      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.5rem' }}>API 密钥</h3>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)', marginBottom:'1rem' }}>
          使用 API key 通过公共 API 管理你的域名 DNS。Base URL{' '}
          <code style={{ fontSize:'0.8125rem' }}>/api/v1/open</code>, 请求头{' '}
          <code style={{ fontSize:'0.8125rem' }}>Authorization: Bearer &lt;key&gt;</code>.
        </p>

        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem' }}>
          <input className="input" placeholder="例如：我的脚本" value={keyName}
            onChange={e => setKeyName(e.target.value)} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !keyName.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            创建密钥
          </button>
        </div>

        {keys.length === 0 ? (
          <div style={{ textAlign:'center', padding:'2rem' }}>
            <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)' }}>暂无 API 密钥</p>
            <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>在上方输入名称创建一个，通过 API 管理域名 DNS。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>名称</th><th>密钥</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight:600 }}>{k.name}</td>
                    <td style={{ fontFamily:'monospace', fontSize:'0.8125rem' }}>
                      {k.key.substring(0, 12)}...
                      <button className="btn btn-ghost btn-sm" onClick={() => copyKey(k.key)} style={{ marginLeft:'0.5rem' }}>复制</button>
                    </td>
                    <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(k.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.5rem' }}>快速开始</h3>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>
          创建密钥后，在请求头中传入以调用开放 API。
        </p>
        <pre className="card" style={{ fontFamily:'monospace', fontSize:'0.75rem', lineHeight:1.75, padding:'1rem', overflow:'auto', background:'var(--bg-hover)' }}>
{`# 列出你的域名
curl -H "Authorization: Bearer lc_你的密钥" \\
  https://REDACTED.example.com/api/v1/open/subdomains

# 新增一条 DNS 记录
curl -X POST \\
  -H "Authorization: Bearer lc_你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"A","name":"@","content":"1.2.3.4","ttl":3600}' \\
  https://REDACTED.example.com/api/v1/open/subdomains/{id}/records`}
        </pre>
      </div>
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
