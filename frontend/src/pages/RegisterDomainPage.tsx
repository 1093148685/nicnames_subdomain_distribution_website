import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

type RootDomain = {
  name: string
  credits: number
  description?: string
  source?: string
  expiry?: string
  paused?: boolean
  pause_reason?: string
}

type SearchResult = {
  root_domain: string
  available: boolean
  price?: number
  reason?: string
}

const MAX_SELECTED_DOMAINS = 3

export default function RegisterDomainPage() {
  const [rootDomains, setRootDomains] = useState<RootDomain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [prefix, setPrefix] = useState('')
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [registeringDomain, setRegisteringDomain] = useState<string | null>(null)

  useEffect(() => {
    api.getCredits().then(res => setCredits(res.credits)).catch(() => {})
    api.getDomains().then(res => {
      const list = (res.domains || []).map((d: any) => ({
        name: d.name,
        credits: Number(d.credits || 0),
        description: d.description,
        source: d.source,
        expiry: d.expiry,
        paused: !!d.paused,
        pause_reason: d.pause_reason,
      }))
      setRootDomains(list)
      setSelectedDomains([])
    }).catch((err: any) => {
      showToast(err.message || '加载根域名失败', 'error')
    }).finally(() => setLoadingDomains(false))
  }, [])

  const selectedInfos = rootDomains.filter(d => selectedDomains.includes(d.name))
  const normalizedPrefix = prefix.trim().toLowerCase()
  const selectedPreview = selectedDomains.length > 0 ? selectedDomains.map(d => `${normalizedPrefix || '你的前缀'}.${d}`).join(' / ') : '请选择根域名'

  const clearResults = () => setSearchResults([])

  const toggleDomain = (domain: string) => {
    setSelectedDomains(prev => {
      if (prev.includes(domain)) return prev.filter(d => d !== domain)
      if (prev.length >= MAX_SELECTED_DOMAINS) {
        showToast(`最多只能选择 ${MAX_SELECTED_DOMAINS} 个根域名`, 'error')
        return prev
      }
      return [...prev, domain]
    })
    clearResults()
  }

  const handleSearch = async () => {
    if (!normalizedPrefix || selectedDomains.length === 0) return
    setSearching(true)
    clearResults()
    try {
      const results = await Promise.all(selectedDomains.map(async rootDomain => {
        try {
          const res = await api.checkSubdomain({ prefix: normalizedPrefix, root_domain: rootDomain })
          return { root_domain: rootDomain, ...res }
        } catch (err: any) {
          return { root_domain: rootDomain, available: false, reason: err.message || '实时校验失败' }
        }
      }))
      setSearchResults(results)
      const okCount = results.filter(r => r.available).length
      if (okCount > 0) showToast(`${okCount} 个域名实时校验通过，可以注册`, 'success')
      const reservedOrBlocked = results.find(r => !r.available && r.reason)
      if (reservedOrBlocked) showToast(`${normalizedPrefix}.${reservedOrBlocked.root_domain}：${reservedOrBlocked.reason}`, 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleRegister = async (rootDomain: string) => {
    setRegisteringDomain(rootDomain)
    try {
      const res = await api.registerSubdomain({ prefix: normalizedPrefix, root_domain: rootDomain })
      showToast(`成功注册 ${res.subdomain.domain}`, 'success')
      api.getCredits().then(res => setCredits(res.credits)).catch(() => {})
      setSearchResults(prev => prev.filter(item => item.root_domain !== rootDomain))
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setRegisteringDomain(null)
    }
  }

  if (loadingDomains) return <PageSkeleton />

  return (
    <div>
      <p className="page-desc">
        输入前缀后手动选择根域名，最多选择 3 个批量查询。当前共有 {rootDomains.length} 个可用根域名。可注册性最终以 NicNames 实时 DNS 记录为准，若官网已有同名前缀或通配记录会直接拦截。
        {credits !== null ? ` 当前积分：${credits}` : ''}
      </p>

      {rootDomains.length === 0 ? (
        <div className="empty-state"><p>暂无可用根域名，可能是管理员已暂停分发或 NicNames 暂无可用域名。</p></div>
      ) : (
        <div className="register-domain-panel">
          <div className="register-prefix-row">
            <div className="prefix-input-wrap">
              <label>想注册的前缀</label>
              <input className="input" placeholder="例如 api、blog、docs" value={prefix}
                onChange={e => { setPrefix(e.target.value); clearResults() }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <span>{selectedPreview}</span>
            </div>
            <button className="btn btn-primary" onClick={handleSearch} disabled={!normalizedPrefix || selectedDomains.length === 0 || searching}>
              {searching ? '校验中...' : `实时校验 ${selectedDomains.length} 个`}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="domain-result-list">
              {searchResults.map(result => (
                <div key={result.root_domain} className={`domain-result-card ${result.available ? 'ok' : 'bad'}`}>
                  <div>
                    <p>{normalizedPrefix}.{result.root_domain}</p>
                    <span>
                      {result.available
                        ? `可注册，需要 ${result.price} 积分`
                        : (result.reason || '不可用：该前缀已被占用或被保留')}
                    </span>
                  </div>
                  {result.available && (
                    <button className="btn btn-primary" onClick={() => handleRegister(result.root_domain)} disabled={registeringDomain !== null}>
                      {registeringDomain === result.root_domain ? '注册中...' : `确认注册（扣 ${result.price || 0} 积分）`}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="domain-picker-head">
            <div>
              <strong>选择根域名</strong>
              <p>最多选择 {MAX_SELECTED_DOMAINS} 个，同时查询同一前缀是否可注册</p>
            </div>
            <span className="badge badge-primary">共 {rootDomains.length} 个 · 已选 {selectedDomains.length}/{MAX_SELECTED_DOMAINS}</span>
          </div>
          <div className="domain-choice-grid">
            {rootDomains.map(d => {
              const active = selectedDomains.includes(d.name)
              const disabled = !active && selectedDomains.length >= MAX_SELECTED_DOMAINS
              return (
                <button key={d.name} type="button" className={`domain-choice ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => toggleDomain(d.name)}>
                  <span className="domain-choice-name"><span className="domain-choice-check">{active ? '✓' : '+'}</span>.{d.name}</span>
                  <span className="domain-choice-meta">
                    <b>{d.credits}</b> 积分 · {d.source === 'nicnames' ? 'NicNames 实时' : '本地兜底'}
                  </span>
                  <span className="domain-choice-desc">{d.expiry ? `有效期至 ${d.expiry}` : d.description || '可用于自助创建二级域名'}</span>
                </button>
              )
            })}
          </div>

          {selectedInfos.length > 0 && (
            <div className="domain-current-tip">
              当前选择 <b>{selectedInfos.map(d => `.${d.name}`).join('、')}</b>，注册前会读取 NicNames 真实记录，防止抢占已存在前缀。
            </div>
          )}
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
