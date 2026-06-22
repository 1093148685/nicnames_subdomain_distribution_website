import { useState, useEffect } from 'react'
import { api } from '../api'

function translateDescription(text: string) {
  const value = (text || '').trim()
  if (!value || /^[-+]?\d+(\.\d+)?$/.test(value)) return '积分调整'
  return value
    .replace('注册奖励', '注册奖励')
    .replace('管理员发放', '管理员发放')
    .replace('认领域名', '认领域名')
    .replace('兑换码', '兑换码')
}

function formatDate(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getActivity()
      .then(data => setActivities(data.activities || []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSkeleton />

  return (
    <div className="localhost-activity-page">
      <div className="localhost-page-heading">
        <h1>活动记录</h1>
        <p>你的积分变更和域名活动历史。</p>
      </div>

      <div className="localhost-activity-card">
        {activities.length === 0 ? (
          <div className="localhost-empty">暂无活动记录。</div>
        ) : (
          <ul className="localhost-activity-list">
            {activities.map((a: any, i: number) => {
              const positive = Number(a.amount) > 0
              const amount = Number(a.amount || 0)
              return (
                <li key={i} className="localhost-activity-item">
                  <div className="localhost-activity-left">
                    <span className={`localhost-activity-icon ${positive ? 'positive' : ''}`}>
                      {positive ? '+' : '−'}
                    </span>
                    <div className="localhost-activity-meta">
                      <p>{translateDescription(a.description)}</p>
                      <time>{formatDate(a.created_at)}</time>
                    </div>
                  </div>
                  <span className={`localhost-activity-amount ${positive ? 'positive' : ''}`}>
                    {positive ? '+' : ''}{amount}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="localhost-activity-page">
      <div className="loading-stack">
        <div className="skeleton skeleton-line" style={{ width: 140, height: 28 }} />
        <div className="skeleton skeleton-line" style={{ width: 280, height: 18 }} />
        <div className="skeleton skeleton-table" />
        <div className="skeleton skeleton-table" />
        <div className="skeleton skeleton-table" />
      </div>
    </div>
  )
}
