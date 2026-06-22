import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api, type Domain, type Subdomain, type DNSRecord } from '../api';
import DNSManage from './DNSManage';

/* ── Sidebar ── */
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || (path !== '/console' && location.pathname.startsWith(path + '/'));

  const menuGroups: { label: string; items: { label: string; path: string; icon: string }[] }[] = [
    {
      label: '主菜单',
      items: [
        { label: '仪表盘', path: '/console', icon: '📊' },
        { label: '官网域名搜索', path: '/console/domain-search', icon: '🔍' },
        { label: '注册域名', path: '/console/register', icon: '✨' },
        { label: '我的域名', path: '/console/domains', icon: '🌐' },
        { label: 'Whois 查询', path: '/console/whois', icon: '🔎' },
      ],
    },
    {
      label: '账号',
      items: [
        { label: '积分中心', path: '/console/credits', icon: '⚡' },
        { label: '邀请好友', path: '/console/invite', icon: '📨' },
        { label: '活动记录', path: '/console/activity', icon: '📋' },
        { label: 'API 管理', path: '/console/api-keys', icon: '🔑' },
        { label: '账号设置', path: '/console/settings', icon: '⚙️' },
      ],
    },
  ];

  if (user?.role === 'admin') {
    menuGroups.push({
      label: '管理',
      items: [
        { label: '管理概览', path: '/console/admin', icon: '📈' },
        { label: '用户管理', path: '/console/admin/users', icon: '👥' },
        { label: '域名管理', path: '/console/admin/domains', icon: '🌍' },
        { label: '保留前缀', path: '/console/admin/reserved', icon: '🚫' },
        { label: '高级前缀', path: '/console/admin/premium', icon: '💎' },
        { label: '审核管理', path: '/console/admin/moderation', icon: '🛡️' },
        { label: '站点展示', path: '/console/admin/showcase', icon: '🏆' },
        { label: '审计日志', path: '/console/admin/audit', icon: '📝' },
        { label: '系统设置', path: '/console/admin/settings', icon: '🔧' },
        { label: '设备指纹', path: '/console/admin/fingerprints', icon: '🖐️' },
      ],
    });
  }

  return (
    <div style={{
      width: '220px', minWidth: '220px', padding: '0.75rem',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', height: 'fit-content',
      position: 'sticky', top: '80px',
    }}>
      {menuGroups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0.5rem',
            marginBottom: '0.35rem',
          }}>
            {group.label}
          </div>
          {group.items.map(item => {
            const active = isActive(item.path);
            return (
              <button key={item.path} onClick={() => { navigate(item.path); onClose?.(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                  padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
                  border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                  fontSize: '0.8rem', fontWeight: active ? 600 : 400,
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.15s', marginBottom: '2px', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '0.9rem' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Layout ── */
function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-spinner" style={{ padding: '4rem', textAlign: 'center' }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="page-container" style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {children}
      </div>
    </div>
  );
}

/* ── Helper: admin-only guard ── */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <Card title="权限不足"><div className="empty-state"><div className="empty-state-icon">🚫</div><h3>管理员权限</h3><p>只有管理员才能访问此页面</p></div></Card>;
  }
  return <>{children}</>;
}

/* ── Utility card wrapper ── */
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card fade-in">
      <div className="card-header">
        <div className="card-title">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════ */
function Dashboard() {
  const { user, credits } = useAuth();
  const [subdomains, setSubdomains] = useState<Subdomain[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getSubdomains().then(d => { setSubdomains(d.subdomains); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="card fade-in">
        <div className="card-header">
          <div>
            <div className="card-title" style={{ fontSize: '1.25rem' }}>欢迎回来，{user?.username}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{user?.email}</div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--warning)' }}>{credits}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>积分</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-light)' }}>
                {loading ? '...' : subdomains.length}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>域名</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-glow" onClick={() => navigate('/console/register')}><span>认领新域名</span></button>
          <button className="btn-outline" onClick={() => navigate('/console/domain-search')}>官网域名搜索</button>
          <button className="btn-outline" onClick={() => navigate('/console/domains')}>管理域名</button>
        </div>
      </div>

      <Card title="我的域名" action={
        <button className="btn-ghost" onClick={() => navigate('/console/domains')}>查看全部</button>
      }>
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : subdomains.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌐</div>
            <h3>还没有域名</h3>
            <p>认领你的第一个子域名吧</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {subdomains.slice(0, 5).map(sd => (
              <div key={sd.id} className="domain-card" style={{ padding: '0.75rem 1rem' }}
                onClick={() => navigate(`/console/domains/${sd.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{sd.fqdn}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{sd.root_domain}</div>
                  </div>
                  <span className="badge badge-success"><span className="dot active" /> 已激活</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════
   DOMAIN SEARCH (NicNames official)
   ══════════════════════════════════════════ */
function DomainSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setResults(null);
    try {
      const data = await api.nicnamesSearch(query.trim());
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <Card title="官网域名搜索" action={
      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>由 NicNames 提供</span>
    }>
      <div className="form-group">
        <label>输入域名关键词</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="form-input" type="text" placeholder="例如：myproject"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()} style={{ flex: 1 }} />
          <button className="btn-glow" onClick={search} disabled={loading}>
            <span>{loading ? '搜索中...' : '搜索'}</span>
          </button>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {results !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem' }}>
          {results.length === 0 ? (
            <div className="empty-state"><p>未找到匹配域名</p></div>
          ) : (
            results.slice(0, 20).map((r: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <div>
                  <span style={{ fontWeight: r.available ? 600 : 400 }}>{r.domain}</span>
                  {r.premium && <span className="badge badge-warning" style={{ marginLeft: '0.35rem' }}>溢价</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {r.price ? `$${r.price}/年` : ''}
                  </span>
                  <span className={`badge ${r.available ? 'badge-success' : 'badge-danger'}`}>
                    {r.available ? '可注册' : '已注册'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════
   REGISTER SUBDOMAIN
   ══════════════════════════════════════════ */
function RegisterDomain() {
  const { credits } = useAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [prefix, setPrefix] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkMsg, setCheckMsg] = useState('');
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState<Subdomain | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getDomains().then(d => {
      const avail = d.domains.filter(dd => dd.distribution_enabled);
      setDomains(avail);
      setLoading(false);
      if (avail.length > 0) setSelectedDomain(avail[0].name);
    }).catch(() => setLoading(false));
  }, []);

  const checkAvailability = async () => {
    if (!prefix || !selectedDomain) return;
    setChecking(true); setAvailable(null); setCheckMsg('');
    try {
      const res = await api.checkSubdomain({ prefix, root_domain: selectedDomain });
      setAvailable(res.available);
      setCheckMsg(res.message || '');
    } catch (err: any) {
      setAvailable(false);
      setCheckMsg(err.message);
    } finally { setChecking(false); }
  };

  const handleRegister = async () => {
    if (!prefix || !selectedDomain || !available) return;
    setError(''); setRegistering(true);
    try {
      const res = await api.registerSubdomain({ prefix, root_domain: selectedDomain });
      setSuccess(res.subdomain);
    } catch (err: any) {
      setError(err.message);
    } finally { setRegistering(false); }
  };

  if (success) {
    return (
      <Card title="🎉 认领成功！">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.2rem', color: 'var(--primary-light)', marginBottom: '0.75rem' }}>
            {success.fqdn}
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>现在去配置 DNS 记录。</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn-glow" onClick={() => navigate(`/console/domains/${success.id}`)}><span>配置 DNS</span></button>
            <button className="btn-outline" onClick={() => { setSuccess(null); setPrefix(''); setAvailable(null); }}>再认领一个</button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="认领子域名" action={
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        积分: <strong style={{ color: 'var(--warning)' }}>{credits}</strong>
      </span>
    }>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>选择根域名</label>
            <select className="form-input" value={selectedDomain}
              onChange={e => { setSelectedDomain(e.target.value); setAvailable(null); }}>
              {domains.map(d => (
                <option key={d.id} value={d.name}>{d.name} ({d.credits} 积分)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>子域名前缀</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="form-input" type="text" placeholder="例如：myproject"
                value={prefix} onChange={e => {
                  setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setAvailable(null);
                }} style={{ flex: 1 }} maxLength={63} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                .{selectedDomain}
              </span>
            </div>
          </div>

          {prefix.length >= 2 && (
            <div>
              <button className="btn-outline" onClick={checkAvailability} disabled={checking} style={{ width: '100%' }}>
                {checking ? '检查中...' : available === null ? '检查可用性' : '重新检查'}
              </button>
              {available !== null && (
                <div style={{
                  marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                  background: available ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${available ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  fontSize: '0.82rem', color: available ? 'var(--success)' : 'var(--danger)',
                }}>
                  {available ? `✅ ${prefix}.${selectedDomain} 可用！` : `❌ ${checkMsg || '已被占用'}`}
                </div>
              )}
            </div>
          )}
          {available && (
            <button className="btn-glow" onClick={handleRegister} disabled={registering}>
              <span>{registering ? '认领中...' : `确认认领 ${prefix}.${selectedDomain}`}</span>
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════
   MY DOMAINS
   ══════════════════════════════════════════ */
function MyDomains() {
  const [subdomains, setSubdomains] = useState<Subdomain[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => api.getSubdomains().then(d => { setSubdomains(d.subdomains); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  return (
    <Card title="我的域名" action={
      <button className="btn-glow" onClick={() => navigate('/console/register')}><span>认领新域名</span></button>
    }>
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : subdomains.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🌐</div>
          <h3>还没有认领域名</h3>
          <p>点击上方按钮认领你的第一个子域名</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {subdomains.map(sd => (
            <div key={sd.id} className="domain-card" style={{ padding: '0.75rem 1rem' }}
              onClick={() => navigate(`/console/domains/${sd.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{sd.fqdn}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                    {sd.root_domain} · {new Date(sd.created_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="badge badge-success"><span className="dot active" /> 已激活</span>
                  <span className="badge badge-primary">DNS</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════
   WHOIS
   ══════════════════════════════════════════ */
function Whois() {
  return (
    <Card title="Whois 查询">
      <div className="empty-state">
        <div className="empty-state-icon">🔎</div>
        <h3>Whois 查询已集成</h3>
        <p>可通过 NicNames API 查询域名注册信息（功能对接中）</p>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════
   CREDITS
   ══════════════════════════════════════════ */
function Credits() {
  const { credits } = useAuth();
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [msg, setMsg] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    api.getCreditsTransactions().then(d => setTransactions(d.transactions)).catch(() => {});
  }, []);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true); setMsg('');
    try {
      const res = await api.redeemCredits({ code: code.trim() });
      setMsg(`✅ 成功兑换 ${res.credits} 积分`);
      setCode('');
      api.getCreditsTransactions().then(d => setTransactions(d.transactions)).catch(() => {});
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally { setRedeeming(false); }
  };

  return (
    <>
      <Card title="积分兑换" action={<span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{credits}</span>}>
        <div className="form-group">
          <label>兑换码</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="form-input" type="text" placeholder="输入兑换码"
              value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-glow" onClick={handleRedeem} disabled={redeeming}>
              <span>{redeeming ? '兑换中...' : '兑换'}</span>
            </button>
          </div>
          {msg && <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>{msg}</div>}
        </div>
      </Card>

      <Card title="积分记录">
        {transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚡</div>
            <h3>暂无记录</h3>
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>时间</th><th>类型</th><th>说明</th><th>变动</th></tr></thead>
            <tbody>
              {transactions.slice(0, 20).map((t: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {new Date(t.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td>{t.type}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{t.description}</td>
                  <td style={{ color: (t.amount || 0) > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {(t.amount || 0) > 0 ? '+' : ''}{t.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════
   INVITE
   ══════════════════════════════════════════ */
function Invite() {
  const { user } = useAuth();
  const link = `https://dns.ccocc.cyou/register?invite=${user?.username}`;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <Card title="邀请好友">
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>分享邀请链接，好友注册后你们都能获得额外积分奖励。</p>
      <div className="form-group">
        <label>你的邀请链接</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="form-input" readOnly value={link} style={{ flex: 1, opacity: 0.7 }} />
          <button className="btn-glow" onClick={copy}><span>{copied ? '已复制' : '复制'}</span></button>
        </div>
      </div>
      <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>🎁 邀请奖励</div>
        <ul style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: 'var(--text-tertiary)', paddingLeft: '1.2rem' }}>
          <li>每成功邀请一位好友，你获得 <strong style={{ color: 'var(--warning)' }}>10 积分</strong></li>
          <li>好友首次注册额外获得 <strong style={{ color: 'var(--warning)' }}>5 积分</strong></li>
        </ul>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════
   API KEYS
   ══════════════════════════════════════════ */
function ApiKeys() {
  return (
    <Card title="API 管理" action={<span className="badge badge-primary">个人</span>}>
      <div className="empty-state">
        <div className="empty-state-icon">🔑</div>
        <h3>API 管理</h3>
        <p>在此管理你的 API 访问密钥（功能对接中）</p>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════
   ADMIN - OVERVIEW
   ══════════════════════════════════════════ */
function AdminOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminStats().then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  if (loading) return <AdminGuard><Card title="管理概览"><div className="loading-spinner"><div className="spinner" /></div></Card></AdminGuard>;
  const cards = [
    { label: '用户总数', value: stats?.users ?? '—', color: 'var(--primary-light)' },
    { label: '子域名数', value: stats?.subdomains ?? '—', color: 'var(--accent)' },
    { label: '根域名数', value: stats?.domains ?? '—', color: 'var(--warning)' },
    { label: 'DNS 记录', value: stats?.dns_records ?? '—', color: 'var(--success)' },
  ];
  return (
    <AdminGuard>
      <Card title="管理概览" action={<span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>系统运行概览</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {cards.map((c, i) => (
            <div key={i} style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>{c.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - USERS
   ══════════════════════════════════════════ */
function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.getAdminUsers().then(d => { setUsers(d.users || []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  return (
    <AdminGuard>
      <Card title="用户管理">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
          <table className="data-table">
            <thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>积分</th><th>操作</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{u.id}</td>
                  <td><strong>{u.username}</strong></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{u.email || '—'}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-primary'}`}>{u.role}</span></td>
                  <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{u.credits ?? 0}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - DOMAINS (all subdomains)
   ══════════════════════════════════════════ */
function AdminDomains() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminSubdomains().then(d => { setSubs(d.subdomains || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <AdminGuard>
      <Card title="域名管理（所有子域名）">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : subs.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🌍</div><h3>暂无子域名</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>ID</th><th>完整域名</th><th>根域名</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{s.id}</td>
                  <td><strong>{s.fqdn || s.prefix + '.' + s.root_domain}</strong></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.root_domain}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{s.status}</span></td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('zh-CN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - RESERVED PREFIXES
   ══════════════════════════════════════════ */
function AdminReserved() {
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrefix, setNewPrefix] = useState('');
  const [newNote, setNewNote] = useState('');
  const load = () => api.getAdminReservedPrefixes().then(d => { setPrefixes(d.prefixes || []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!newPrefix.trim()) return;
    await api.createAdminReservedPrefix({ prefix: newPrefix.trim(), note: newNote.trim() || undefined });
    setNewPrefix(''); setNewNote(''); load();
  };
  const del = async (id: number) => { await api.deleteAdminReservedPrefix(id); load(); };
  return (
    <AdminGuard>
      <Card title="保留前缀">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input className="form-input" placeholder="前缀" value={newPrefix} onChange={e => setNewPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} style={{ flex: 1 }} />
              <input className="form-input" placeholder="备注（可选）" value={newNote} onChange={e => setNewNote(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-glow" onClick={add}><span>添加</span></button>
            </div>
            {prefixes.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">🚫</div><h3>暂无保留前缀</h3></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>前缀</th><th>备注</th><th>操作</th></tr></thead>
                <tbody>
                  {prefixes.map(p => (
                    <tr key={p.id}>
                      <td><code style={{ color: 'var(--primary-light)' }}>{p.prefix}</code></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{p.note || '—'}</td>
                      <td><button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => del(p.id)}>删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - PREMIUM PREFIXES
   ══════════════════════════════════════════ */
function AdminPremium() {
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.getAdminPremiumPrefixes().then(d => { setPrefixes(d.prefixes || []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  return (
    <AdminGuard>
      <Card title="高级前缀">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : prefixes.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">💎</div><h3>暂无高级前缀</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>前缀</th><th>根域名</th><th>价格（积分）</th></tr></thead>
            <tbody>
              {prefixes.map(p => (
                <tr key={p.id}>
                  <td><code style={{ color: 'var(--accent)' }}>{p.prefix}</code></td>
                  <td>{p.root_domain || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--warning)' }}>{p.credits ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - MODERATION
   ══════════════════════════════════════════ */
function AdminModeration() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.getAdminModeration().then(d => { setItems(d.items || []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  return (
    <AdminGuard>
      <Card title="审核管理">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : items.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🛡️</div><h3>暂无待审核项</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>ID</th><th>用户</th><th>内容</th><th>状态</th></tr></thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{m.id}</td>
                  <td>{m.username || m.user_id}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{m.description || m.content || '—'}</td>
                  <td><span className={`badge ${m.status === 'pending' ? 'badge-warning' : m.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - SHOWCASE SITES
   ══════════════════════════════════════════ */
function AdminShowcase() {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminShowcaseSites().then(d => { setSites(d.sites || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <AdminGuard>
      <Card title="站点展示">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : sites.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🏆</div><h3>暂无展示站点</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>站点名称</th><th>URL</th><th>描述</th></tr></thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.title || s.name}</strong></td>
                  <td><a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', fontSize: '0.82rem' }}>{s.url}</a></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{s.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - AUDIT LOGS
   ══════════════════════════════════════════ */
function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminAuditLogs().then(d => { setLogs(d.logs || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <AdminGuard>
      <Card title="审计日志">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : logs.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📝</div><h3>暂无审计日志</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>时间</th><th>用户</th><th>操作</th><th>IP</th></tr></thead>
            <tbody>
              {logs.slice(0, 50).map((l, i) => (
                <tr key={l.id || i}>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{l.created_at ? new Date(l.created_at).toLocaleString('zh-CN') : '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>{l.username || l.user_id || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{l.action || l.description || '—'}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{l.ip_address || l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - SETTINGS
   ══════════════════════════════════════════ */
function AdminSettings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminSettings().then(d => { setSettings(d.settings || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <AdminGuard>
      <Card title="系统设置">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : settings.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🔧</div><h3>暂无系统设置</h3></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Key</th><th>Value</th><th>类型</th></tr></thead>
            <tbody>
              {settings.map(s => (
                <tr key={s.key || s.id}>
                  <td><code style={{ fontSize: '0.78rem' }}>{s.key}</code></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {typeof s.value === 'string' ? s.value.substring(0, 80) : JSON.stringify(s.value).substring(0, 80)}
                  </td>
                  <td><span className="badge badge-primary">{s.type || 'string'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ADMIN - FINGERPRINTS
   ══════════════════════════════════════════ */
function AdminFingerprints() {
  const [fps, setFps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getAdminFingerprints().then(d => { setFps(d.fingerprints || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <AdminGuard>
      <Card title="设备指纹">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : fps.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🖐️</div><h3>暂无设备指纹</h3></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {fps.slice(0, 30).map((f, i) => (
              <div key={f.id || i} style={{ padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{f.fingerprint?.substring(0, 40)}...</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{f.user_id ? `用户 #${f.user_id}` : '未关联'} · {f.ip || '—'}</div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{f.created_at ? new Date(f.created_at).toLocaleDateString('zh-CN') : '—'}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminGuard>
  );
}

/* ══════════════════════════════════════════
   ACTIVITY
   ══════════════════════════════════════════ */
function Activity() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getActivity().then(d => { setItems(d.items || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <Card title="活动记录">
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><h3>暂无活动</h3></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {items.map((item: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg)',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.type === 'domain_register' ? '🌐' : item.type === 'dns_record' ? '📝' : '⚙️'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem' }}>{item.description}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                  {new Date(item.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════ */
function Settings() {
  const { user, signOut } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');

  return (
    <>
      <Card title="账号设置">
        <div className="form-group">
          <label>用户名</label>
          <input className="form-input" value={user?.username || ''} disabled style={{ opacity: 0.5 }} />
        </div>
        <div className="form-group">
          <label>邮箱</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>新密码</label>
          <input className="form-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="留空不修改" />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-glow"><span>保存</span></button>
          <button className="btn-outline" onClick={signOut} style={{ color: 'var(--danger)' }}>退出登录</button>
        </div>
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════
   CONSOLE ROUTER
   ══════════════════════════════════════════ */
export default function ConsolePage() {
  return (
    <ConsoleLayout>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="domain-search" element={<DomainSearch />} />
        <Route path="register" element={<RegisterDomain />} />
        <Route path="domains" element={<MyDomains />} />
        <Route path="domains/:id" element={<DNSManage />} />
        <Route path="whois" element={<Whois />} />
        <Route path="credits" element={<Credits />} />
        <Route path='invite' element={<Invite />} />
        <Route path='activity' element={<Activity />} />
        <Route path='api-keys' element={<ApiKeys />} />
        <Route path='settings' element={<Settings />} />

        {/* Admin routes */}
        <Route path='admin' element={<AdminOverview />} />
        <Route path='admin/users' element={<AdminUsers />} />
        <Route path='admin/domains' element={<AdminDomains />} />
        <Route path='admin/reserved' element={<AdminReserved />} />
        <Route path='admin/premium' element={<AdminPremium />} />
        <Route path='admin/moderation' element={<AdminModeration />} />
        <Route path='admin/showcase' element={<AdminShowcase />} />
        <Route path='admin/audit' element={<AdminAudit />} />
        <Route path='admin/settings' element={<AdminSettings />} />
        <Route path='admin/fingerprints' element={<AdminFingerprints />} />
      </Routes>
    </ConsoleLayout>
  );
}
