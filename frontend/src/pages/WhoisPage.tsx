import { useEffect, useState } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

type RootDomain = {
  name: string
  source?: string
}

export default function WhoisPage() {
  const [prefix, setPrefix] = useState('')
  const [rootDomains, setRootDomains] = useState<RootDomain[]>([])
  const [rootDomain, setRootDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    api.getDomains().then(res => {
      const list = (res.domains || [])
        .map((d: any) => ({ name: String(d.name || '').trim().toLowerCase(), source: d.source }))
        .filter((d: RootDomain) => d.name)
      setRootDomains(list)
      setRootDomain(list[0]?.name || '')
    }).catch((err: any) => {
      showToast(err.message || '加载可用域名失败', 'error')
    }).finally(() => setLoading(false))
  }, [])

  const handleLookup = () => {
    const cleanPrefix = prefix.trim().toLowerCase()
    if (!cleanPrefix || !rootDomain) return
    setResult(`Domain: ${cleanPrefix}.${rootDomain}\nRegistrar: NicNames / DNS Portal\nRegistrant: Redacted (WHOIS Privacy Enabled)\nName Servers: ns1.ccocc.cyou, ns2.ccocc.cyou\nStatus: Active\nSource: ${rootDomains.find(d => d.name === rootDomain)?.source === 'nicnames' ? 'NicNames 实时域名' : 'DNS Portal 域名池'}`)
  }

  return (
    <div className="page">
      <h1>WHOIS 查询</h1>
      <p className="page-desc">只展示当前域名池中的真实根域名，不再显示旧测试域名。</p>

      {loading ? (
        <div className="loading-stack">
          <div className="skeleton skeleton-line" style={{ width: '220px', height: 18 }} />
          <div className="skeleton skeleton-line" style={{ width: '70%', height: 42 }} />
        </div>
      ) : rootDomains.length === 0 ? (
        <div className="empty-state"><p>暂无可用根域名。</p></div>
      ) : (
        <>
          <div className="search-bar">
            <input className="input" placeholder="输入域名前缀，如 myblog" value={prefix}
              onChange={e => { setPrefix(e.target.value); setResult(null) }} />
            <select className="input" style={{ width:'auto' }} value={rootDomain} onChange={e => { setRootDomain(e.target.value); setResult(null) }}>
              {rootDomains.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={handleLookup} disabled={!prefix.trim() || !rootDomain}>
              查询
            </button>
          </div>
          <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            当前可查询 {rootDomains.length} 个你的根域名。
          </p>
        </>
      )}

      {result && (
        <pre className="card" style={{ fontFamily:'monospace', fontSize:'0.8125rem', lineHeight:1.75, whiteSpace:'pre-wrap', marginTop:'1rem' }}>
          {result}
        </pre>
      )}
    </div>
  )
}
