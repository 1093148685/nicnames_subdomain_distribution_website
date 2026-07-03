import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

export default function InvitePage() {
  const [invite, setInvite] = useState<{ code: string; link: string; count: number; earnings: number; records: any[] } | null>(null)
  const [customCode, setCustomCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getInvite().then(data => {
      setInvite(data)
      setCustomCode(data.code)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const copyLink = () => {
    if (!invite) return
    navigator.clipboard.writeText(invite.link)
    showToast('邀请链接已复制', 'success')
  }

  const saveCode = async () => {
    if (customCode.length < 4 || customCode.length > 16) {
      showToast('邀请码需要 4-16 个字符', 'error')
      return
    }
    setSaving(true)
    try {
      await api.updateInviteCode(customCode)
      showToast('邀请码已更新', 'success')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div style={{ maxWidth:'40rem' }}>
      <p className="page-desc">邀请好友注册，好友完成验证后，双方各获 10 积分。</p>

      <div className="stats-grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div className="stat-card" style={{ textAlign:'center' }}>
          <div className="stat-card-value">{invite?.count ?? 0}</div>
          <div className="stat-card-label">邀请人数</div>
        </div>
        <div className="stat-card" style={{ textAlign:'center' }}>
          <div className="stat-card-value" style={{ color:'#22c55e' }}>+{invite?.earnings ?? 0}</div>
          <div className="stat-card-label">累计收益 积分</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.5rem' }}>我的邀请链接</h3>
        <div className="invite-box">
          <code className="invite-code">{invite?.link ?? '加载中...'}</code>
          <button className="btn btn-primary btn-sm" onClick={copyLink}>复制</button>
        </div>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
          分享链接给好友，通过该链接注册的用户将成为你的邀请。
        </p>
      </div>

      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.5rem' }}>自定义邀请码</h3>
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.5rem' }}>
          <input className="input" placeholder="4-16 位字母、数字或连字符" value={customCode}
            onChange={e => setCustomCode(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={saveCode} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
          邀请码必须唯一，修改后旧链接将失效。
        </p>
      </div>

      <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.75rem' }}>
        邀请记录（共 {invite?.records.length ?? 0} 条）
      </h3>
      {(!invite?.records || invite.records.length === 0) ? (
        <div className="empty-state" style={{ textAlign:'center', padding:'2rem' }}>
          <p>暂无邀请记录</p>
          <p style={{ fontSize:'0.8125rem' }}>分享邀请链接给好友，好友验证后你将获得积分。</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop:'0.75rem' }} onClick={copyLink}>复制邀请链接</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>好友</th><th>日期</th><th>状态</th><th>奖励</th></tr></thead>
            <tbody>
              {invite.records.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.friend_username}</td>
                  <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td><span className={r.verified ? 'badge badge-success' : 'badge badge-warning'}>{r.verified ? '已验证' : '待验证'}</span></td>
                  <td>{r.reward > 0 ? `+${r.reward}` : '-'}</td>
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
