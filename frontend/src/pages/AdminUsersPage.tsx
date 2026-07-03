import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { showToast } from '../components/Toast'

type UserTab = 'users' | 'credits' | 'groups' | 'notifications' | 'fingerprints'

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<UserTab>('users')

  const tabs: { key: UserTab; label: string }[] = [
    { key: 'users', label: '用户' },
    { key: 'credits', label: '积分' },
    { key: 'fingerprints', label: '设备指纹' },
    { key: 'groups', label: '用户组' },
    { key: 'notifications', label: '通知' },
  ]

  return (
    <div>
      <p className="page-desc">用户管理 — 管理用户、积分、用户组和通知</p>

      <div className="pill-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`pill-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'credits' && <CreditsTab />}
      {activeTab === 'fingerprints' && <FingerprintsTab />}
      {activeTab === 'groups' && <GroupsTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  )
}

/* ─── Users Tab ─────────────────────────────────────── */

function UsersTab() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [grantModal, setGrantModal] = useState<{ user: any } | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [granting, setGranting] = useState(false)

  const fetchUsers = async (q?: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.adminGetUsers(q ? { search: q } : undefined)
      setUsers(data.users)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    const timer = window.setInterval(() => fetchUsers(search, true), 12000)
    return () => window.clearInterval(timer)
  }, [search])

  const handleSearch = () => fetchUsers(search)

  const handleBan = async (userId: number, banned: boolean) => {
    if (!confirm(banned ? '解封该用户？' : '封禁该用户？')) return
    try {
      if (banned) {
        await api.adminUnbanUser(userId)
      } else {
        await api.adminBanUser(userId)
      }
      showToast(banned ? '已解封' : '已封禁', 'success')
      fetchUsers(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (userId: number, username: string) => {
    if (!confirm(`确认永久删除用户「${username}」？\n\n此操作不可撤销，将同时删除其所有域名、DNS 记录、API Key 和相关数据。`)) return
    try {
      await api.adminDeleteUser(userId)
      showToast(`用户 ${username} 已删除`, 'success')
      fetchUsers(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleRole = async (userId: number, role: string) => {
    try {
      await api.adminUpdateRole(userId, role)
      showToast('角色已更新', 'success')
      fetchUsers(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleGrantCredits = async () => {
    if (!grantModal || !grantAmount) return
    setGranting(true)
    try {
      await api.adminGrantCredits(grantModal.user.id, parseInt(grantAmount))
      showToast(`已向 ${grantModal.user.username} 发放 ${grantAmount} 积分`, 'success')
      setGrantModal(null)
      setGrantAmount('')
      fetchUsers(search)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setGranting(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div className="search-bar">
        <input className="input" placeholder="搜索用户名或邮箱..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <button className="btn btn-primary btn-sm" onClick={handleSearch}>搜索</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>积分</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{u.id}</td>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td style={{ fontSize: '0.8125rem' }}>{u.email || '-'}</td>
                <td>
                  <select className="input" style={{ width: 'auto', fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
                    value={u.role} onChange={e => handleRole(u.id, e.target.value)}>
                    <option value="user">用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </td>
                <td style={{ fontWeight: 600 }}>{u.credits ?? 0}</td>
                <td>
                  {u.banned
                    ? <span className="badge badge-warning">已封禁</span>
                    : <span className="badge badge-success">正常</span>
                  }
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setGrantModal({ user: u })}>
                      发放
                    </button>
                    <button className={`btn btn-sm ${u.banned ? 'btn-primary' : 'btn-danger'}`}
                      onClick={() => handleBan(u.id, u.banned)}>
                      {u.banned ? '解封' : '封禁'}
                    </button>
                    <button className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => handleDelete(u.id, u.username)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无用户</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {grantModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGrantModal(null)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setGrantModal(null)}>✕</button>
            <h2>发放积分</h2>
            <p>向 <strong>{grantModal.user.username}</strong> 发放积分（当前：{grantModal.user.credits ?? 0}）</p>
            <div className="form-group">
              <label>数量</label>
              <input className="input" type="number" min="1" placeholder="输入数量..." value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setGrantModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleGrantCredits}
                disabled={granting || !grantAmount || parseInt(grantAmount) <= 0}>
                {granting ? '发放中...' : '发放'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── Credits Tab (Bulk Grant) ──────────────────────── */

/* ─── Credits Tab (Bulk Grant) ──────────────────────── */

function CreditsTab() {
  const [users, setUsers] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [reason, setReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [redeemAmount, setRedeemAmount] = useState('')
  const [redeemCount, setRedeemCount] = useState('1')
  const [redeemPrefix, setRedeemPrefix] = useState('DNS')
  const [creatingRedeem, setCreatingRedeem] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null)
  /* ── 按组发放 state ── */
  const [grantMode, setGrantMode] = useState<'per_user' | 'by_group'>('per_user')
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('')
  const [groupAmount, setGroupAmount] = useState('')

  useEffect(() => {
    Promise.all([
      api.adminGetUsers(),
      api.adminGetGroups(),
    ]).then(([uData, gData]) => {
      setUsers(uData.users)
      setGroups(gData.groups)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleGrant = async () => {
    if (grantMode === 'by_group') {
      if (!selectedGroupId || !groupAmount || parseInt(groupAmount) <= 0) {
        showToast('请选择用户组并输入发放数量', 'error')
        return
      }
      setGranting(true)
      try {
        const g = groups.find(g => g.id === selectedGroupId)
        const res = await api.adminBulkGrantCredits({
          mode: 'by_group',
          group_id: selectedGroupId,
          amount: parseInt(groupAmount),
          reason: reason || undefined,
        })
        showToast(`已向「${g?.name || selectedGroupId}」${res.updated} 位成员发放 ${groupAmount} 积分`, 'success')
        setReason('')
        setGroupAmount('')
      } catch (err: any) {
        showToast(err.message, 'error')
      } finally {
        setGranting(false)
      }
      return
    }

    /* per_user mode */
    const entries = Object.entries(amounts).filter(([, v]) => v && parseInt(v) > 0)
    if (entries.length === 0) {
      showToast('请至少输入一个数量', 'error')
      return
    }
    setGranting(true)
    try {
      await api.adminBulkGrantCredits({
        mode: 'per_user',
        amounts: entries.map(([uid, amt]) => ({ user_id: parseInt(uid), amount: parseInt(amt) })),
        reason: reason || undefined,
      })
      showToast(`已向 ${entries.length} 位用户发放积分`, 'success')
      setAmounts({})
      setReason('')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setGranting(false)
    }
  }

  if (loading) return <PageSkeleton />

  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        {/* 发放模式切换 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={`btn btn-sm ${grantMode === 'by_group' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setGrantMode('by_group')}>按用户组发放</button>
          <button className={`btn btn-sm ${grantMode === 'per_user' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setGrantMode('per_user')}>按用户逐个发放</button>
        </div>

        {grantMode === 'by_group' ? (
          <>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>按用户组批量发放</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              选择用户组并输入统一数量，组内所有成员一次性发放。
            </p>
            <div className="form-group">
              <label>选择用户组</label>
              <select className="input" value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value ? parseInt(e.target.value) : '')}>
                <option value="">-- 请选择 --</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}（{g.member_count} 人）</option>
                ))}
              </select>
            </div>
            {selectedGroup && (
              <div className="form-group">
                <label>每位成员发放数量</label>
                <input className="input" type="number" min="1" placeholder="输入积分数量"
                  value={groupAmount} onChange={e => setGroupAmount(e.target.value)} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  该组共 {selectedGroup.member_count} 名成员，预计合计发放 {selectedGroup.member_count * (parseInt(groupAmount) || 0)} 积分
                </p>
              </div>
            )}
            <div className="form-group">
              <label>备注（可选）</label>
              <input className="input" placeholder="例如：月度奖励" value={reason}
                onChange={e => setReason(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>按用户逐个发放积分</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              为每位用户输入金额，留空跳过。
            </p>
            <div className="form-group">
              <label>备注（可选）</label>
              <input className="input" placeholder="例如：月度奖励" value={reason}
                onChange={e => setReason(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>生成兑换码</h3>
          <button className="btn btn-primary btn-sm" onClick={() => { setRedeemAmount(''); setRedeemCount('1'); setRedeemPrefix('DNS'); setGeneratedCodes(null); setShowRedeemModal(true) }}>
            + 生成兑换码
          </button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          生成一次性兑换码，用户可在积分中心兑换积分。
        </p>
      </div>

      {grantMode === 'per_user' && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>当前积分</th>
                  <th>发放数量</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.credits ?? 0}</td>
                    <td>
                      <input className="input" type="number" min="0" placeholder="0"
                        style={{ width: '120px', fontSize: '0.8125rem' }}
                        value={amounts[u.id] ?? ''}
                        onChange={e => setAmounts(prev => ({ ...prev, [u.id]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={handleGrant} disabled={granting}>
          {granting ? '发放中...' : '批量发放积分'}
        </button>
      </div>

      {showRedeemModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowRedeemModal(false), setGeneratedCodes(null))}>
          <div className="modal" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => { setShowRedeemModal(false); setGeneratedCodes(null) }}>✕</button>
            {generatedCodes ? (
              <>
                <h2>兑换码已生成</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  共生成 <strong>{generatedCodes.length}</strong> 个兑换码，每个可兑换 <strong>{redeemAmount}</strong> 积分。兑换码为一次性使用，用后即失效。
                </p>
                <div style={{
                  background: 'var(--bg)',
                  borderRadius: '8px',
                  padding: '1rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  lineHeight: '1.8',
                }}>
                  {generatedCodes.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button className="btn btn-primary" onClick={() => {
                    navigator.clipboard.writeText(generatedCodes.join('\n'))
                    showToast('已复制到剪贴板', 'success')
                  }}>复制全部</button>
                  <button className="btn btn-outline" onClick={() => { setShowRedeemModal(false); setGeneratedCodes(null) }}>关闭</button>
                </div>
              </>
            ) : (
              <>
                <h2>生成兑换码</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  兑换码用户可在积分中心输入兑换，用后即失效。
                </p>
                <div className="form-group">
                  <label>积分数量</label>
                  <input className="input" type="number" min="1" placeholder="例如：50" value={redeemAmount}
                    onChange={e => setRedeemAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>生成数量</label>
                  <input className="input" type="number" min="1" max="100" placeholder="1" value={redeemCount}
                    onChange={e => setRedeemCount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>前缀（可选，如 DNS → DNS-XXXXXXXX）</label>
                  <input className="input" placeholder="DNS" maxLength={10} value={redeemPrefix}
                    onChange={e => setRedeemPrefix(e.target.value)} />
                </div>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={() => setShowRedeemModal(false)}>取消</button>
                  <button className="btn btn-primary" onClick={async () => {
                    const amount = parseInt(redeemAmount)
                    const count = parseInt(redeemCount) || 1
                    if (!amount || amount <= 0) { showToast('请输入有效的积分数量', 'error'); return }
                    if (count < 1 || count > 100) { showToast('生成数量需在 1-100 之间', 'error'); return }
                    setCreatingRedeem(true)
                    try {
                      const data = await api.adminCreateRedeemCodes({ amount, count, prefix: redeemPrefix || undefined })
                      setGeneratedCodes(data.codes)
                      showToast(`生成了 ${data.count} 个兑换码`, 'success')
                    } catch (err: any) {
                      showToast(err.message, 'error')
                    } finally {
                      setCreatingRedeem(false)
                    }
                  }} disabled={creatingRedeem || !redeemAmount}>
                    {creatingRedeem ? '生成中...' : '生成'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ─── Groups Tab ────────────────────────────────────── */

function GroupsTab() {
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [detailGroup, setDetailGroup] = useState<any>(null)
  const [detailMembers, setDetailMembers] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [addUserId, setAddUserId] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  const fetchGroups = async () => {
    try {
      const data = await api.adminGetGroups()
      setGroups(data.groups)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGroups() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.adminCreateGroup(newName.trim())
      showToast('用户组已创建', 'success')
      setShowCreate(false)
      setNewName('')
      fetchGroups()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (g: any) => {
    if (!confirm(`确认删除用户组「${g.name}」？${g.member_count > 0 ? `（该组还有 ${g.member_count} 名成员）` : ''}`)) return
    try {
      await api.adminDeleteGroup(g.id)
      showToast('用户组已删除', 'success')
      fetchGroups()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleRename = async () => {
    if (!renaming || !renaming.name.trim()) return
    try {
      await api.adminRenameGroup(renaming.id, renaming.name.trim())
      showToast('组名已更新', 'success')
      setRenaming(null)
      fetchGroups()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const openDetail = async (g: any) => {
    setDetailGroup(g)
    setDetailLoading(true)
    setAddUserId('')
    try {
      const data = await api.adminGetGroupMembers(g.id)
      setDetailMembers(data.members)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!addUserId.trim()) return
    try {
      await api.adminAddGroupMember(detailGroup!.id, parseInt(addUserId.trim()))
      showToast('成员已添加', 'success')
      setAddUserId('')
      const data = await api.adminGetGroupMembers(detailGroup!.id)
      setDetailMembers(data.members)
      fetchGroups()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleRemoveMember = async (userId: number, username: string) => {
    if (!confirm(`确认将「${username}」移出该组？`)) return
    try {
      await api.adminRemoveGroupMember(detailGroup!.id, userId)
      showToast('成员已移除', 'success')
      setDetailMembers(detailMembers.filter(m => m.id !== userId))
      fetchGroups()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ 新建用户组</button>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state"><p>暂无用户组</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>成员数</th>
                <th>默认</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id}>
                  <td style={{ color: 'var(--text-secondary)' }}>{g.id}</td>
                  <td style={{ fontWeight: 600 }}>
                    {renaming?.id === g.id ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <input className="input" style={{ width: '120px', padding: '2px 6px', fontSize: '0.8125rem' }}
                          value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus />
                        <button className="btn btn-sm btn-primary" onClick={handleRename}>保存</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setRenaming(null)}>取消</button>
                      </span>
                    ) : (
                      <span>{g.name}</span>
                    )}
                  </td>
                  <td>{g.member_count}</td>
                  <td>{g.is_default ? '✅' : '-'}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {g.created_at ? new Date(g.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openDetail(g)}>成员</button>
                      <button className="btn btn-sm btn-outline"
                        onClick={() => setRenaming({ id: g.id, name: g.name })}>重命名</button>
                      {!g.is_default && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(g)}>删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            <h2>新建用户组</h2>
            <p>创建一个新的用户分组，用于区分不同用户群体的域名注册成本和配额</p>
            <div className="form-group">
              <label>组名</label>
              <input className="input" placeholder="输入组名" value={newName}
                onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}
                disabled={creating || !newName.trim()}>{creating ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailGroup && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailGroup(null)}>
          <div className="modal" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setDetailGroup(null)}>✕</button>
            <h2>用户组：{detailGroup.name}</h2>
            <p>成员管理 — 共 {detailMembers.length} 人</p>

            <div className="form-group" style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>添加成员（用户 ID）</label>
                <input className="input" type="number" placeholder="输入用户 ID" value={addUserId}
                  onChange={e => setAddUserId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMember()} />
              </div>
              <button className="btn btn-sm btn-primary" onClick={handleAddMember}
                disabled={!addUserId.trim()}>添加</button>
            </div>

            {detailLoading ? (
              <PageSkeleton />
            ) : detailMembers.length === 0 ? (
              <div className="empty-state" style={{ marginTop: '1rem' }}><p>暂无成员</p></div>
            ) : (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>用户名</th>
                      <th>邮箱</th>
                      <th>积分</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailMembers.map(m => (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-secondary)' }}>{m.id}</td>
                        <td style={{ fontWeight: 600 }}>{m.username}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{m.email}</td>
                        <td>{m.credits}</td>
                        <td>
                          <button className="btn btn-sm btn-danger"
                            onClick={() => handleRemoveMember(m.id, m.username)}>移出</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ─── Notifications Tab ─────────────────────────────── */

function NotificationsTab() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [userId, setUserId] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchNotifications = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.adminGetNotifications()
      setNotifications(data.notifications)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
    const timer = window.setInterval(() => fetchNotifications(true), 15000)
    return () => window.clearInterval(timer)
  }, [])

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return
    setCreating(true)
    try {
      await api.adminCreateNotification({
        title: title.trim(),
        content: content.trim(),
        user_id: userId ? parseInt(userId) : undefined,
      })
      showToast('通知已创建', 'success')
      setShowCreate(false)
      setTitle('')
      setContent('')
      setUserId('')
      fetchNotifications()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ 新建通知</button>
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state"><p>暂无通知</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>内容</th>
                <th>目标用户</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => (
                <tr key={n.id}>
                  <td style={{ color: 'var(--text-secondary)' }}>{n.id}</td>
                  <td style={{ fontWeight: 600 }}>{n.title}</td>
                  <td style={{ fontSize: '0.8125rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.content}
                  </td>
                  <td>{n.username || n.user_id || '全部'}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {new Date(n.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            <h2>新建通知</h2>
            <p>向指定用户或全体用户发送通知</p>
            <div className="form-group">
              <label>标题</label>
              <input className="input" placeholder="通知标题" value={title}
                onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>内容</label>
              <textarea className="input" rows={3} placeholder="通知内容..." value={content}
                onChange={e => setContent(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label>用户 ID（留空则发送给所有人）</label>
              <input className="input" type="number" placeholder="留空=全体广播" value={userId}
                onChange={e => setUserId(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}
                disabled={creating || !title.trim() || !content.trim()}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── Fingerprints Tab ──────────────────────── */
/* 
  用户管理的「设备指纹」tab 已迁移到独立页面 /admin/fingerprints
  这里提供一个简短的快捷入口，避免功能重复
*/
function FingerprintsTab() {
  const navigate = useNavigate()
  return (
    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 0 0-10 10v3"/>
          <path d="M22 12c0-4.42-2.23-8.18-5.6-10.41"/>
          <path d="M2 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-7a5 5 0 0 1 10 0v7a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2"/>
          <circle cx="12" cy="14" r="2"/>
        </svg>
      </div>
      <h3 style={{ marginBottom: '0.5rem' }}>设备指纹管理</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', maxWidth: '320px', margin: '0 auto 1rem' }}>
        查看所有用户的登录记录、设备信息、浏览器指纹和匿名访问记录。
        支持按 IP / 用户搜索，已登录和匿名记录分开查看。
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/admin/fingerprints')}>
        打开设备指纹管理
      </button>
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
