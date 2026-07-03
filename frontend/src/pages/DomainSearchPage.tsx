import { useState } from 'react'
import { api } from '../api'

type SearchResult = {
  domain: string
  tld: string
  status: string
  available: boolean
  premium?: boolean
  currency?: string
  price?: number | null
  initial_price?: number | null
  period?: string
  source?: string
  reason?: string
}

type BundleResult = {
  slug: string
  title: string
  domains: Array<{ domain: string; price?: number | null; free_in_bundle?: boolean; period?: string }>
  domain_count: number
  available: boolean
  currency?: string
  price?: number | null
  initial_price?: number | null
  period?: string
}

function formatAmount(price?: number | null, currency = 'USD') {
  if (price === null || price === undefined) return '官网未返回'
  return `${currency === 'USD' ? '$' : currency + ' '}${price.toFixed(2)}`
}

function formatPrice(item: SearchResult) {
  return formatAmount(item.price, item.currency || 'USD')
}

function statusLabel(item: SearchResult) {
  if (item.status === 'available') return '可注册'
  if (item.status === 'registered' || item.status === 'unavailable') return '已被注册'
  if (item.status === 'premium') return '高级域名'
  return item.status || '未知'
}

function sourceLabel(source?: string) {
  if (source === 'whois') return 'WHOIS'
  if (source === 'ens') return 'ENS'
  if (source === 'inferred') return '官网推断'
  if (source === 'official' || source === 'api') return '官网精确'
  return source || '官网'
}

export default function DomainSearchPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<{ query: string; status: string; count: number; bundle_count?: number; source_url: string; results: SearchResult[]; bundles?: BundleResult[] } | null>(null)

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError('')
    try {
      const res = await api.searchNicNamesDomains(q)
      setData(res)
    } catch (e: any) {
      setError(e.message || '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  const results = data?.results || []
  const bundles = data?.bundles || []

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>官网域名搜索</h1>
            <p className="page-desc" style={{ marginTop: '0.5rem' }}>
              实时调用 NicNames 官网搜索结果，展示站长 Plus 成本价。这里只查询价格和可用状态，不暴露 NicNames 凭证。
            </p>
          </div>
          {data?.source_url && (
            <a className="btn btn-outline" href={data.source_url} target="_blank" rel="noreferrer">查看官网结果</a>
          )}
        </div>

        <div className="search-bar" style={{ marginTop: '1rem' }}>
          <input
            className="input"
            placeholder="输入关键词或域名，如 mybrand / mybrand.com"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={!query.trim() || loading}>
            {loading ? '官网搜索中...' : '实时搜索'}
          </button>
        </div>

        {error && <p style={{ color: 'var(--destructive)', marginTop: '0.75rem' }}>{error}</p>}
        {data && !error && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
            关键词：{data.query} · 状态：{data.status === 'complete' ? '已完成' : data.status} · 返回 {data.count} 条
          </p>
        )}
      </div>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ height: 20, width: 180, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 80, width: '100%', borderRadius: 12 }} />
        </div>
      )}

      {!loading && bundles.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.125rem' }}>官网组合推荐</h2>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                按 NicNames 官网 bundle 接口返回，常见为“买一个后缀，另一个后缀首年免费/优惠”。
              </p>
            </div>
            <span className="badge badge-primary">{bundles.length} 组</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {bundles.map(bundle => (
              <div key={bundle.slug} className="card" style={{ margin: 0, borderColor: 'var(--primary-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800 }}>{bundle.title}</p>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {bundle.domain_count} 个域名 · {bundle.period || '组合首年'}
                    </p>
                  </div>
                  <span className={`badge ${bundle.available ? 'badge-success' : 'badge-warning'}`}>{bundle.available ? '可注册' : '部分不可用'}</span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {bundle.domains.map(d => (
                    <div key={d.domain} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <span>{d.domain}</span>
                      <strong style={{ color: d.free_in_bundle ? 'var(--success)' : 'var(--foreground)' }}>
                        {d.free_in_bundle ? '组合内免费' : formatAmount(d.price, bundle.currency || 'USD')}
                      </strong>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    原价 {bundle.initial_price && bundle.initial_price !== bundle.price ? formatAmount(bundle.initial_price, bundle.currency || 'USD') : '—'}
                  </span>
                  <strong style={{ fontSize: '1rem' }}>{formatAmount(bundle.price, bundle.currency || 'USD')}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>域名</th>
                  <th>状态</th>
                  <th>Plus 成本价/首年</th>
                  <th>原价</th>
                  <th>类型</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {results.map(item => (
                  <tr key={item.domain}>
                    <td style={{ fontWeight: 700 }}>{item.domain}</td>
                    <td>
                      <span className={`badge ${item.available ? 'badge-success' : 'badge-warning'}`}>{statusLabel(item)}</span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatPrice(item)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {item.initial_price && item.initial_price !== item.price ? `$${item.initial_price.toFixed(2)}` : '—'}
                    </td>
                    <td>{item.premium ? <span className="badge badge-primary">高级</span> : <span className="badge">普通</span>}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{sourceLabel(item.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && data && results.length === 0 && (
        <div className="card empty-state">
          <h3>没有搜索结果</h3>
          <p>换一个关键词试试。</p>
        </div>
      )}
    </div>
  )
}
