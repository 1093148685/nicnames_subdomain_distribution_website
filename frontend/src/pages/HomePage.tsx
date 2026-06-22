import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api, type Domain } from '../api';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDomains().then(d => { setDomains(d.domains); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">✨ React Bits 驱动 · 全新视觉体验</div>
        <h1>
          你的域名，<br />
          <span className="gradient-text">即刻部署</span>
        </h1>
        <p>
          认领域名、配置 DNS 记录，几秒钟让你的项目上线。
          用 React Bits 动画组件打造的炫酷管理体验。
        </p>
        <div className="hero-actions">
          <button className="btn-glow" onClick={() => navigate(user ? '/console' : '/')}>
            <span>{user ? '进入控制台' : '开始使用'}</span>
          </button>
          <button className="btn-outline" onClick={() => {
            document.getElementById('domains-section')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            浏览可用域名
          </button>
        </div>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-value" style={{ color: 'var(--primary-light)' }}>{domains.length}</div>
            <div className="stat-label">可用根域名</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>∞</div>
            <div className="stat-label">子域名容量</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: 'var(--success)' }}>DNS</div>
            <div className="stat-label">完整记录管理</div>
          </div>
        </div>
      </section>

      {/* Domain Cards */}
      <section className="section" id="domains-section">
        <h2 className="section-title">可用根域名</h2>
        <p className="section-subtitle">选择一个根域名，认领你的专属子域名前缀</p>
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : domains.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌐</div>
            <h3>暂无可用域名</h3>
            <p>请稍后再来查看</p>
          </div>
        ) : (
          <div className="domains-grid">
            {domains.map(d => (
              <div key={d.id} className="domain-card fade-in"
                onClick={() => navigate(user ? '/console/register' : '#')}
                style={{ animationDelay: `${(d.id % 10) * 0.05}s` }}>
                <div className="domain-card-name">{d.name}</div>
                <div className="domain-card-price">
                  <span className="credits-icon" />
                  {d.credits} 积分
                </div>
                {d.distribution_enabled && <span className="claim-badge">可认领</span>}
                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  {d.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">为什么选择 ReactBits DNS？</h2>
        <p className="section-subtitle">不止是域名管理，更是一场视觉体验</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {[
            { icon: '🎨', title: '炫酷 UI', desc: '使用 React Bits 动画组件，从背景到按钮都充满设计感' },
            { icon: '⚡', title: '实时 DNS', desc: '通过 NicNames API 实时同步，配置立即可用' },
            { icon: '🔐', title: '安全可靠', desc: 'JWT 认证、IP 风控、扫描防护，多维度安全策略' },
            { icon: '🆓', title: '免费使用', desc: '基础积分免费获取，邀请好友还能获得额外奖励' },
          ].map((f, i) => (
            <div key={i} className="domain-card fade-in" style={{ cursor: 'default' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <div className="domain-card-name" style={{ fontSize: '1rem' }}>{f.title}</div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        textAlign: 'center', padding: '2rem', fontSize: '0.78rem',
        color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)',
      }}>
        ReactBits DNS · 基于 React Bits 和 FastAPI 构建 · 由 NicNames 驱动
      </footer>
    </div>
  );
}
