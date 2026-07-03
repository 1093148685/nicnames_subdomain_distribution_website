import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { showToast } from '../components/Toast'

const NS_SERVERS = 'ns1.ccocc.cyou, ns2.ccocc.cyou'

export default function MyDomainsPage() {
  const [subdomains, setSubdomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [releasingId, setReleasingId] = useState<number | null>(null)

  const fetchDomains = async () => {
    setLoading(true)
    try {
      const data = await api.getMySubdomains()
      setSubdomains(data.subdomains)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDomains() }, [])

  const handleRelease = async (domain: any) => {
    const ok = confirm(`确定释放 ${domain.domain} 吗？\n\n释放后该域名会从你的列表移除，并同步删除真实 DNS 记录。\n已扣积分不退还。`)
    if (!ok) return
    setReleasingId(domain.id)
    try {
      await api.deleteSubdomain(domain.id)
      showToast(`已释放 ${domain.domain}，积分不退`, 'success')
      fetchDomains()
    } catch (err: any) {
      showToast(err.message || '释放失败', 'error')
    } finally {
      setReleasingId(null)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <p className="page-desc" style={{ marginBottom:0 }}>管理已认领的域名；不再使用时可释放，释放后积分不退。</p>
        <Link to="/register" className="btn btn-primary btn-sm">认领新域名</Link>
      </div>

      {subdomains.length === 0 ? (
        <div className="empty-state">
          <p>你还没有认领任何域名</p>
          <Link to="/register" className="btn btn-primary btn-sm">浏览域名</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>域名</th>
                <th>根域名</th>
                <th>名称服务器</th>
                <th>创建时间</th>
                <th>DNS 记录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {subdomains.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight:600 }}>{d.domain}</td>
                  <td>{d.root_domain}</td>
                  <td style={{ fontSize:'0.8125rem', fontFamily:'monospace' }}>{NS_SERVERS}</td>
                  <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <span className="badge badge-primary">{d.records_count || 0} 条记录</span>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                      <Link to={`/my-domains/${d.id}`} className="btn btn-ghost btn-sm">
                        DNS 管理
                      </Link>
                      <button className="btn btn-danger btn-sm" onClick={() => handleRelease(d)} disabled={releasingId !== null}>
                        {releasingId === d.id ? '释放中...' : '释放域名'}
                      </button>
                    </div>
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
