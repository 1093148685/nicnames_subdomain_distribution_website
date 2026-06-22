import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Subdomain, type DNSRecord } from '../api';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA'];

export default function DNSManage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState<Subdomain | null>(null);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Record form
  const [showForm, setShowForm] = useState(false);
  const [recordType, setRecordType] = useState('A');
  const [recordName, setRecordName] = useState('@');
  const [recordContent, setRecordContent] = useState('');
  const [recordTtl, setRecordTtl] = useState(3600);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const sd = (await api.getSubdomains()).subdomains.find(s => s.id === parseInt(id));
      if (sd) setSubdomain(sd);
      const recs = await api.getRecords(parseInt(id));
      setRecords(recs.records);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleCreateRecord = async () => {
    if (!id || !recordContent) return;
    setSaving(true); setError('');
    try {
      await api.createRecord(parseInt(id), {
        record_type: recordType,
        record_name: recordName,
        content: recordContent.trim(),
        ttl: recordTtl,
      });
      setShowForm(false);
      setRecordContent('');
      setRecordName('@');
      setRecordType('A');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!id) return;
    await api.deleteRecord(parseInt(id), recordId);
    load();
  };

  const BACKEND_URL = 'https://dns.ccocc.cyou';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <>
          {/* Subdomain info */}
          <div className="card fade-in">
            <div className="card-header">
              <div>
                <div className="card-title">{subdomain?.fqdn || '未知域名'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  根域名: {subdomain?.root_domain} · 前缀: {subdomain?.prefix}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => navigate('/console/domains')}>返回</button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-glow" onClick={() => setShowForm(!showForm)}>
                <span>{showForm ? '取消' : '添加记录'}</span>
              </button>
            </div>
          </div>

          {/* Add record form */}
          {showForm && (
            <div className="card fade-in">
              <div className="card-header">
                <div className="card-title">添加 DNS 记录</div>
              </div>
              {error && <div className="form-error">{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>记录类型</label>
                  <select className="form-input" value={recordType} onChange={e => setRecordType(e.target.value)}>
                    {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>记录名</label>
                  <input className="form-input" type="text" placeholder="@"
                    value={recordName} onChange={e => setRecordName(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>记录值</label>
                  <input className="form-input" type="text"
                    placeholder={recordType === 'A' ? '例如: 1.2.3.4' : '记录值'}
                    value={recordContent} onChange={e => setRecordContent(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>TTL（秒）</label>
                  <input className="form-input" type="number" value={recordTtl}
                    onChange={e => setRecordTtl(parseInt(e.target.value) || 3600)}
                    min={14400} max={86400} />
                </div>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn-glow" onClick={handleCreateRecord} disabled={saving}>
                  <span>{saving ? '添加中...' : '添加记录'}</span>
                </button>
              </div>
            </div>
          )}

          {/* DNS Records table */}
          <div className="card fade-in">
            <div className="card-header">
              <div className="card-title">DNS 记录 ({records.length})</div>
            </div>
            {records.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <h3>暂无 DNS 记录</h3>
                <p>添加一条记录来配置你的域名</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>名称</th>
                    <th>值</th>
                    <th>TTL</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>
                        <span className="badge badge-primary">{r.record_type}</span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{r.record_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.content}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.ttl}s</td>
                      <td>
                        <button className="btn-ghost" style={{ color: 'var(--danger)', fontSize: '0.78rem' }}
                          onClick={() => handleDeleteRecord(r.id)}>
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* NS Record hint */}
          <div className="card fade-in" style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.12)' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              💡 <strong>提示：</strong>添加 A 记录指向你的服务器 IP，然后通过 
              <code style={{
                padding: '0.15rem 0.35rem', background: 'var(--bg)', borderRadius: '4px',
                fontFamily: 'monospace', fontSize: '0.78rem', margin: '0 0.25rem',
              }}>
                {subdomain?.fqdn}
              </code>
              即可访问你的网站。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
