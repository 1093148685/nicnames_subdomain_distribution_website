import { useState, useEffect } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

const typeLabel: Record<string, string> = {
  grant: '发放',
  deduct: '扣除',
  admin_grant: '管理员发放',
  admin_deduct: '管理员扣除',
}

function translateDescription(text: string) {
  return (text || '')
    .replace('Registration bonus', '注册奖励')
    .replace('Admin grant', '管理员发放')
    .replace('Claim domain', '认领域名')
    .replace('Redeem code', '兑换码')
}

export default function CreditsPage() {
  const [credits, setCredits] = useState(0)
  const [transactions, setTransactions] = useState<any[]>([])
  const [redeemCode, setRedeemCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getCredits().then(data => {
      setCredits(data.credits)
      setTransactions(data.transactions)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return
    setRedeeming(true)
    try {
      const data = await api.redeemCode(redeemCode.trim())
      setCredits(data.credits)
      showToast(`兑换成功！当前积分: ${data.credits}`, 'success')
      setRedeemCode('')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div style={{ maxWidth:'36rem' }}>
      <p className="page-desc">查看积分余额、兑换码和积分流水。</p>

      <div className="card" style={{ textAlign:'center', padding:'2rem', marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)', marginBottom:'0.25rem' }}>当前余额</p>
        <p style={{ fontSize:'2.5rem', fontWeight:800, color:'var(--primary)' }}>{credits}</p>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>可用积分</p>
      </div>

      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.25rem' }}>兑换码</h3>
        <p style={{ fontSize:'0.8125rem', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>
          输入兑换码获取额外积分。
        </p>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <input className="input" placeholder="输入兑换码" value={redeemCode}
            onChange={e => setRedeemCode(e.target.value)} />
          <button className="btn btn-primary" onClick={handleRedeem} disabled={redeeming || !redeemCode.trim()}>
            {redeeming ? '兑换中...' : '兑换'}
          </button>
        </div>
      </div>

      <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.75rem' }}>积分流水</h3>
      {transactions.length === 0 ? (
        <div className="empty-state"><p>暂无积分记录</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>类型</th><th>说明</th><th>时间</th><th>变动</th><th>余额</th></tr></thead>
            <tbody>
              {transactions.map((t: any, i: number) => (
                <tr key={i}>
                  <td><span className={t.type === 'grant' || t.type === 'admin_grant' ? 'badge badge-success' : 'badge badge-warning'}>{typeLabel[t.type] || t.type}</span></td>
                  <td style={{ fontSize:'0.8125rem' }}>{translateDescription(t.description)}</td>
                  <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td style={{ color: t.amount > 0 ? '#22c55e' : 'var(--destructive)', fontWeight:600 }}>
                    {t.amount > 0 ? '+' : ''}{t.amount}
                  </td>
                  <td style={{ fontSize:'0.8125rem', color:'var(--text-secondary)' }}>{t.balance}</td>
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
