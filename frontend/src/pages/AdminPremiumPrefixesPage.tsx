import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function AdminPremiumPrefixesPage() {
  const [tab, setTab] = useState<'prefix' | 'domain'>('prefix')
  const [prefixes, setPrefixes] = useState<any[]>([])
  const [domains, setDomains] = useState<any[]>([])
  const [systemDomains, setSystemDomains] = useState<any[]>([])
  const [newPrefix, setNewPrefix] = useState('')
  const [newPrefixPrice, setNewPrefixPrice] = useState('1000')
  const [newDomain, setNewDomain] = useState('')
  const [newDomainPrice, setNewDomainPrice] = useState('1000')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [p, d, sd] = await Promise.all([
        api.adminGetPremiumPrefixes(),
        api.adminGetPremiumDomains(),
        api.adminGetSystemDomains().catch(() => ({ domains: [] })),
      ])
      setPrefixes(p.prefixes || [])
      setDomains(d.domains || [])
      setSystemDomains(sd.domains || [])
      if (!newDomain && (sd.domains || []).length > 0) setNewDomain(sd.domains[0].name)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const parsePrice = (value: string) => {
    const price = parseInt(value, 10)
    if (Number.isNaN(price) || price <= 0) throw new Error('价格必须是大于 0 的整数积分')
    return price
  }

  const handleAddPrefix = async () => {
    if (!newPrefix.trim()) return
    setAdding(true)
    try {
      const price = parsePrice(newPrefixPrice)
      await api.adminAddPremiumPrefix(newPrefix.trim().toLowerCase(), price)
      showToast(`高级前缀 "${newPrefix.trim()}" 已添加（${price} 积分）`, 'success')
      setNewPrefix('')
      setNewPrefixPrice('1000')
      fetchAll()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return
    setAdding(true)
    try {
      const price = parsePrice(newDomainPrice)
      await api.adminAddPremiumDomain(newDomain.trim().toLowerCase(), price)
      showToast(`高级域名 "${newDomain.trim()}" 已设置为 ${price} 积分`, 'success')
      setNewDomainPrice('1000')
      fetchAll()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDeletePrefix = async (id: number, prefix: string) => {
    if (!confirm(`确认移除高级前缀 "${prefix}"？`)) return
    try {
      await api.adminDeletePremiumPrefix(id)
      showToast(`高级前缀 "${prefix}" 已移除`, 'success')
      fetchAll()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`确认取消高级域名 "${domain}"？取消后恢复默认注册价格。`)) return
    try {
      await api.adminDeletePremiumDomain(domain)
      showToast(`高级域名 "${domain}" 已取消`, 'success')
      fetchAll()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">管理高级前缀和高级根域名。高级前缀命中时优先使用固定价格；高级域名用于把某个根域名设置为更高注册价格。</p>

      <div className="pill-tabs" style={{ marginBottom: '1rem' }}>
        <button className={tab === 'prefix' ? 'active' : ''} onClick={() => setTab('prefix')}>高级前缀</button>
        <button className={tab === 'domain' ? 'active' : ''} onClick={() => setTab('domain')}>高级域名</button>
      </div>

      {tab === 'prefix' ? (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>添加高级前缀</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              例如设置前缀 <code>vip</code> 价格为 <code>1000</code>，用户注册 vip.ccocc.cyou 或 vip123.ccocc.cyou 会按 1000 积分校验和扣费。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input className="input" placeholder="输入前缀，如 vip" value={newPrefix}
                onChange={e => setNewPrefix(e.target.value)} style={{ flex: '1', minWidth: '160px' }} />
              <input className="input" type="number" step="1" min="1" placeholder="固定价格（积分）"
                value={newPrefixPrice} onChange={e => setNewPrefixPrice(e.target.value)} style={{ width: '180px' }} />
              <button className="btn btn-primary" onClick={handleAddPrefix} disabled={adding || !newPrefix.trim()}>
                {adding ? '添加中...' : '添加'}
              </button>
            </div>
          </div>

          {prefixes.length === 0 ? <div className="empty-state"><p>暂无高级前缀</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>ID</th><th>前缀</th><th>价格</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
              {prefixes.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{p.id}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.prefix}</td>
                  <td><span className="badge badge-warning">{Number(p.price_multiplier) >= 100 ? `${Math.round(Number(p.price_multiplier))} 积分` : `×${p.price_multiplier}`}</span></td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{p.created_at ? new Date(p.created_at).toLocaleString() : '-'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDeletePrefix(p.id, p.prefix)}>删除</button></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>设置高级域名</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              把某个根域名设置成高级域名，例如 verydog.bond 注册价 1000 积分。底层会写入 <code>domain_price:根域名</code> 配置。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select className="input" value={newDomain} onChange={e => setNewDomain(e.target.value)} style={{ flex: '1', minWidth: '220px' }}>
                {systemDomains.map(d => <option key={d.name} value={d.name}>{d.name}（当前 {d.credits} 积分）</option>)}
              </select>
              <input className="input" type="number" step="1" min="1" placeholder="固定价格（积分）"
                value={newDomainPrice} onChange={e => setNewDomainPrice(e.target.value)} style={{ width: '180px' }} />
              <button className="btn btn-primary" onClick={handleAddDomain} disabled={adding || !newDomain.trim()}>{adding ? '保存中...' : '保存'}</button>
            </div>
          </div>

          {domains.length === 0 ? <div className="empty-state"><p>暂无高级域名</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>根域名</th><th>价格</th><th>来源</th><th>操作</th></tr></thead><tbody>
              {domains.map(d => (
                <tr key={d.domain}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{d.domain}</td>
                  <td><span className="badge badge-warning">{d.price} 积分</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{d.source || '-'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteDomain(d.domain)}>取消高级</button></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </>
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
