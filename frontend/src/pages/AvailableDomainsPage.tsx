import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const domainIcons: Record<string, string> = {
  'ccocc.cyou': '🌐',
}

const domainPerks: Record<string, string[]> = {
  'ccocc.cyou': ['全 DNS 记录类型', 'WHOIS 隐私保护', '无广告'],
}

const domainColors: Record<string, string> = {
  'ccocc.cyou': '#6366f1',
}

export default function AvailableDomainsPage() {
  const [domains, setDomains] = useState<{ name: string; credits: number; description?: string }[]>([])
  const [prefix, setPrefix] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [searchResult, setSearchResult] = useState<{ available: boolean; price?: number } | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    api.getDomains().then(res => {
      const list = res.domains.map((d: any) => ({ name: d.name, credits: d.credits, description: d.description }))
      setDomains(list)
      if (list.length > 0) setSelectedDomain(list[0].name)
    }).catch(() => {
      setDomains([])
    })
  }, [])

  const handleSearch = async () => {
    if (!prefix.trim()) return
    setSearching(true)
    try {
      const res = await api.checkSubdomain({ prefix: prefix.trim(), root_domain: selectedDomain })
      setSearchResult(res)
    } catch {
      setSearchResult({ available: false })
    } finally {
      setSearching(false)
    }
  }

  const selectDomain = (name: string) => {
    setSelectedDomain(name)
    setSearchResult(null)
    setPrefix('')
  }

  return (
    <div className="page">
      <h1>可用域名</h1>
      <p className="page-desc">浏览可用的根域名并检查前缀是否可注册</p>

      <div className="domain-grid" style={{ marginBottom: '1.5rem' }}>
        {domains.map(d => {
          const icon = domainIcons[d.name] || '📂'
          const perks = domainPerks[d.name] || []
          const color = domainColors[d.name] || 'var(--primary)'
          const isSelected = selectedDomain === d.name

          return (
            <div
              key={d.name}
              className={`domain-card${isSelected ? ' domain-card-selected' : ''}`}
              style={{
                borderColor: isSelected ? color : undefined,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onClick={() => selectDomain(d.name)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                  *.{d.name}
                </h3>
                {isSelected && (
                  <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>当前</span>
                )}
              </div>
              {d.description && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  {d.description}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  所需积分: <strong style={{ color: 'var(--foreground)' }}>{d.credits}</strong>
                </span>
              </div>
              {perks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1rem' }}>
                  {perks.map(p => (
                    <span key={p} className="badge badge-success" style={{ fontSize: '0.6875rem' }}>{p}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link to="/sign-up" className="btn btn-primary btn-sm">立即注册</Link>
                <button
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={(e) => { e.stopPropagation(); selectDomain(d.name) }}
                >
                  {isSelected ? '已选择 ✓' : '搜索'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedDomain && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            检查域名可用性
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            *.{selectedDomain} · 输入前缀检查是否可注册
          </p>

          <div className="search-bar">
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <input
                className="input"
                placeholder="输入前缀，如 myblog"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{ paddingRight: '4rem' }}
              />
              <span style={{
                position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                fontSize: '0.8125rem', color: 'var(--text-secondary)', pointerEvents: 'none',
              }}>
                .{selectedDomain}
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={!prefix.trim() || searching}
            >
              {searching ? '搜索中...' : '检查'}
            </button>
          </div>

          {searchResult && (
            <div className="card" style={{
              marginTop: '1rem',
              borderColor: searchResult.available ? '#22c55e' : 'var(--destructive)',
              borderLeftWidth: '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>
                  {searchResult.available ? '✅' : '❌'}
                </span>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {prefix}.{selectedDomain}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {searchResult.available
                      ? `可以注册 · 需要 ${searchResult.price} 积分`
                      : '已被注册或保留'
                    }
                  </p>
                </div>
              </div>
              {searchResult.available && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <Link to="/sign-up" className="btn btn-primary btn-sm">
                    注册账号并领取
                  </Link>
                  <button className="btn btn-outline btn-sm" onClick={() => { setPrefix(''); setSearchResult(null) }}>
                    继续搜索
                  </button>
                </div>
              )}
              {!searchResult.available && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { setPrefix(''); setSearchResult(null) }}>
                    换一个试试
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
