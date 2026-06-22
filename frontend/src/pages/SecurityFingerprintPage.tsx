import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function SecurityFingerprintPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMyFingerprints().then(data => {
      setRecords(data.fingerprints || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const formatUA = (ua: string) => {
    if (!ua) return { browser: '', os: '' }
    if (ua.includes('Windows NT 10.0')) return { os: 'Windows 10', browser: ua.includes('Edg') ? 'Edge' : ua.includes('Firefox') ? 'Firefox' : 'Chrome' }
    if (ua.includes('Windows NT')) return { os: 'Windows', browser: 'Chrome' }
    if (ua.includes('Android')) return { os: 'Android', browser: 'Chrome' }
    if (ua.includes('iPhone') || ua.includes('iPad')) return { os: 'iOS', browser: 'Safari' }
    if (ua.includes('Mac OS X')) return { os: 'macOS', browser: ua.includes('Edg') ? 'Edge' : ua.includes('Firefox') ? 'Firefox' : 'Safari' }
    if (ua.includes('Linux')) return { os: 'Linux', browser: ua.includes('Headless') ? 'Headless' : 'Chrome' }
    return { os: ua.split(')')[0]?.split('(')[1] || '未知', browser: '' }
  }

  if (loading) {
    return <div className="loading-stack">
      <div className="skeleton skeleton-line" style={{ width: '200px', height: 18 }} />
      <div className="skeleton skeleton-table" />
      <div className="skeleton skeleton-table" />
    </div>
  }

  // 按浏览器ID分组，每组取最新记录+计数
  const byBrowser: Record<string, { records: any[]; count: number }> = {}
  records.forEach(r => {
    const key = r.browser_id || r.ip
    if (!byBrowser[key]) byBrowser[key] = { records: [], count: 0 }
    byBrowser[key].count++
    if (byBrowser[key].records.length === 0 || r.id > byBrowser[key].records[0].id) {
      byBrowser[key].records.unshift(r)
    }
  })

  const browserEntries = Object.entries(byBrowser).sort((a, b) => b[1].records[0]?.id - a[1].records[0]?.id)

  return (
    <div>
      <p className="page-desc">查看你的登录记录、设备信息和浏览器指纹数据。如果看到陌生设备和 IP，建议立即修改密码。</p>

      <div className="stats-row" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem' }}>
          <div className="stat-value">{records.length}</div>
          <div className="stat-label">总访问记录</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem' }}>
          <div className="stat-value">{browserEntries.length}</div>
          <div className="stat-label">设备数</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem' }}>
          <div className="stat-value">{new Set(records.map(r => r.ip)).size}</div>
          <div className="stat-label">独立 IP</div>
        </div>
      </div>

      {/* 按设备分组展示 */}
      {browserEntries.map(([key, group]) => {
        const latest = group.records[0]
        const uaInfo = formatUA(latest.user_agent)
        return (
          <div className="card" style={{ marginBottom: '0.75rem' }} key={key}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem', borderBottom: '1px solid var(--divider)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '8px',
                  background: 'var(--bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.125rem',
                }}>
                  {uaInfo.os === 'Windows 10' ? '🪟' : uaInfo.os === 'Android' ? '📱' : uaInfo.os === 'iOS' ? '🍎' : uaInfo.os === 'macOS' ? '💻' : '🌐'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {uaInfo.os} · {uaInfo.browser || '未知浏览器'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {group.count} 次访问 · 最后活跃: {latest.created_at ? new Date(latest.created_at).toLocaleString('zh-CN') : '-'}
                  </div>
                </div>
              </div>
              {latest.browser_id && (
                <span className="badge badge-primary" style={{ fontSize: '0.6875rem' }}>
                  已识别
                </span>
              )}
            </div>

            {/* 展开的详细记录列表 */}
            <div style={{ padding: '0.5rem 0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '300px', overflowY: 'auto' }}>
                {group.records.slice(0, 1).map(r => (
                  <div key={r.id} style={{
                    padding: '0.5rem', borderRadius: '6px', background: 'var(--bg)',
                    fontSize: '0.75rem', lineHeight: '1.6',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                        {r.action === 'signup' ? '🎉 注册' : r.action === 'login' ? '🔑 登录' : '👁️ 访问'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.6875rem' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : ''}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', color: 'var(--text-secondary)' }}>
                      <span><strong>IP:</strong> {r.ip}</span>
                      {r.geo && r.geo !== r.ip && <span><strong>位置:</strong> {r.geo}</span>}
                      {r.screen_resolution && <span><strong>分辨率:</strong> {r.screen_resolution}</span>}
                      {r.timezone && <span><strong>时区:</strong> {r.timezone}</span>}
                      {r.canvas_hash && <span><strong>Canvas指纹:</strong> {r.canvas_hash.slice(0, 12)}...</span>}
                      {r.browser_id && <span><strong>浏览器ID:</strong> {r.browser_id.slice(0, 16)}...</span>}
                      {r.platform && <span><strong>平台:</strong> {r.platform}</span>}
                    </div>
                    {r.user_agent && (
                      <details style={{ marginTop: '0.25rem' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>
                          User-Agent 详情
                        </summary>
                        <p style={{ wordBreak: 'break-all', color: 'var(--text-tertiary)', marginTop: '0.25rem', fontSize: '0.6875rem' }}>{r.user_agent}</p>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      {records.length === 0 && (
        <div className="empty-state">
          <p>暂无访问记录</p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            当你登录或访问网站时，系统会自动记录你的设备和 IP 信息。
          </p>
        </div>
      )}
    </div>
  )
}
