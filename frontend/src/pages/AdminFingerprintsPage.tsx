import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function AdminFingerprintsPage() {
  const [data, setData] = useState<{ fingerprints: any[]; total: number; page: number; anonymous_count: number; user_count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<'users' | 'anonymous'>('users')
  const [detailUserId, setDetailUserId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<any>(null)

  const fetchData = async (p?: number) => {
    setLoading(true)
    try {
      const params: any = { page: p || page, limit: 50 }
      if (search) params.search = search
      if (mode === 'anonymous') params.anonymous = true
      const res = await api.adminGetAllFingerprints(params)
      setData(res)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchData(1)
  }, [mode])

  const handleSearch = () => {
    setPage(1)
    fetchData(1)
  }

  const handleViewDetail = async (userId: number) => {
    setDetailUserId(userId)
    try {
      const data = await api.adminGetUserDetailFingerprints(userId)
      setDetailData(data)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const formatUA = (ua: string) => {
    if (!ua) return '未知'
    if (ua.includes('Windows NT')) return 'Windows'
    if (ua.includes('Android')) return 'Android'
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
    if (ua.includes('Mac OS X')) return 'macOS'
    if (ua.includes('Linux')) return 'Linux'
    if (ua.includes('python-requests')) return 'API'
    return '未知'
  }

  if (loading && !data) return <div className="loading-stack"><div className="skeleton skeleton-line" style={{ width: '220px', height: 18 }} /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>

  const totalPages = data ? Math.ceil(data.total / 50) : 0

  return (
    <div>
      <p className="page-desc">
        查看所有设备指纹和访问记录。匿名记录是未登录用户的访问，可用于追踪被封禁 IP 的来源。
      </p>

      {/* 统计卡片 */}
      <div className="stats-row" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem', cursor: 'pointer', border: mode === 'users' ? '2px solid var(--primary)' : undefined }}
          onClick={() => setMode('users')}>
          <div className="stat-value">{data?.user_count ?? '-'}</div>
          <div className="stat-label">已登录用户记录</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem', cursor: 'pointer', border: mode === 'anonymous' ? '2px solid var(--primary)' : undefined }}
          onClick={() => setMode('anonymous')}>
          <div className="stat-value">{data?.anonymous_count ?? '-'}</div>
          <div className="stat-label">匿名访问记录（未登录）</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '1rem' }}>
          <div className="stat-value">{data?.total ?? '-'}</div>
          <div className="stat-label">当前显示</div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="search-bar" style={{ marginBottom: '0.75rem' }}>
        <input className="input" placeholder={mode === 'anonymous' ? '搜索 IP 地址...' : '搜索 IP、用户ID 或浏览器ID...'}
          value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <button className="btn btn-primary btn-sm" onClick={handleSearch}>搜索</button>
      </div>

      {/* 表格 */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {mode === 'users' && <th>用户</th>}
              {mode === 'anonymous' && <th>匿名</th>}
              <th>IP</th>
              <th>地理位置</th>
              <th>设备/平台</th>
              <th>浏览器ID</th>
              <th>操作</th>
              <th>时间</th>
              {mode === 'users' && <th>详情</th>}
              {mode === 'anonymous' && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {data?.fingerprints.map(fp => (
              <tr key={fp.id}>
                {mode === 'users' && (
                  <td style={{ fontWeight: 600 }}>
                    #{fp.user_id}
                    {fp.user && <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>{fp.user.username}</span>}
                  </td>
                )}
                {mode === 'anonymous' && (
                  <td>
                    <span className="badge badge-warning" style={{ fontSize: '0.6875rem' }}>未登录</span>
                  </td>
                )}
                <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{fp.ip}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                  {fp.geo && fp.geo !== fp.ip ? fp.geo : '-'}
                </td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  <span className="badge" style={{ fontSize: '0.6875rem', background: 'var(--bg)' }}>
                    {fp.platform || formatUA(fp.user_agent)}
                  </span>
                  {fp.screen_resolution && <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{fp.screen_resolution}</span>}
                </td>
                <td style={{ fontSize: '0.6875rem', fontFamily: 'monospace', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fp.browser_id ? fp.browser_id.slice(0, 16) + '...' : '-'}
                  {fp.canvas_hash && <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>Canvas: {fp.canvas_hash.slice(0, 8)}</span>}
                </td>
                <td>
                  <span className={`badge ${fp.action === 'signup' ? 'badge-primary' : fp.action === 'login' ? 'badge-success' : ''}`}
                    style={{ fontSize: '0.6875rem' }}>
                    {fp.action === 'signup' ? '注册' : fp.action === 'login' ? '登录' : '访问'}
                  </span>
                </td>
                <td style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {fp.created_at ? new Date(fp.created_at).toLocaleString('zh-CN') : '-'}
                </td>
                {mode === 'users' && (
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => handleViewDetail(fp.user_id)}>查看记录</button>
                  </td>
                )}
                {mode === 'anonymous' && (
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      if (navigator.clipboard) {
                        await navigator.clipboard.writeText(fp.ip)
                        showToast('IP 已复制: ' + fp.ip, 'success')
                      }
                    }}>复制IP</button>
                  </td>
                )}
              </tr>
            ))}
            {(!data?.fingerprints || data.fingerprints.length === 0) && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无指纹记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="pagination" style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '0.375rem' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchData(page - 1) }}>上一页</button>
          <span style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); fetchData(page + 1) }}>下一页</button>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailData && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setDetailUserId(null), setDetailData(null))}>
          <div className="modal" style={{ maxWidth: '700px' }}>
            <button className="modal-close" onClick={() => { setDetailUserId(null); setDetailData(null) }}>✕</button>
            <h2>用户 #{detailUserId} 全部指纹记录</h2>
            {detailData.user && (
              <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
                <p><strong>用户名:</strong> {detailData.user.username}</p>
                <p><strong>邮箱:</strong> {detailData.user.email}</p>
                <p><strong>角色:</strong> {detailData.user.role}</p>
              </div>
            )}
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {detailData.fingerprints?.map((fp: any) => (
                <div key={fp.id} style={{
                  padding: '0.625rem 0.75rem', borderRadius: '8px',
                  background: 'var(--bg)', marginBottom: '0.5rem', fontSize: '0.75rem', lineHeight: '1.6',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className={`badge ${fp.action === 'signup' ? 'badge-primary' : fp.action === 'login' ? 'badge-success' : ''}`}>
                      {fp.action === 'signup' ? '注册' : fp.action === 'login' ? '登录' : '访问'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.6875rem' }}>
                      {fp.created_at ? new Date(fp.created_at).toLocaleString('zh-CN') : ''}
                    </span>
                  </div>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.125rem 1rem' }}>
                    <span><strong>IP:</strong> {fp.ip} {fp.geo && fp.geo !== fp.ip && <span style={{ color: 'var(--primary)' }}> · {fp.geo}</span>}</span>
                    {fp.platform && <span><strong>平台:</strong> {fp.platform}</span>}
                    {fp.screen_resolution && <span><strong>分辨率:</strong> {fp.screen_resolution}</span>}
                    {fp.timezone && <span><strong>时区:</strong> {fp.timezone}</span>}
                    {fp.accept_language && <span><strong>语言:</strong> {fp.accept_language}</span>}
                    {fp.canvas_hash && <span><strong>Canvas:</strong> {fp.canvas_hash.slice(0, 16)}</span>}
                    {fp.browser_id && <span><strong>浏览器ID:</strong> {fp.browser_id.slice(0, 20)}</span>}
                    {fp.fonts && fp.fonts.length > 2 && <span><strong>字体:</strong> {fp.fonts.slice(0, 60)}</span>}
                  </div>
                  {fp.user_agent && (
                    <details style={{ marginTop: '0.25rem' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>查看 User-Agent</summary>
                      <p style={{ wordBreak: 'break-all', color: 'var(--text-tertiary)', marginTop: '0.25rem', fontSize: '0.6875rem' }}>{fp.user_agent}</p>
                    </details>
                  )}
                </div>
              ))}
              {(!detailData.fingerprints || detailData.fingerprints.length === 0) && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无记录</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
