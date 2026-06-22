const BASE = ''

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(body.detail || body.message || '请求失败')
  }
  return res.json()
}

export const api = {
  // Auth
  signIn: (data: { username: string; password: string; remember?: boolean }) =>
    request<{ token: string; user: any }>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify(data) }),
  signUp: (data: { username: string; email: string; password: string; invite_code?: string; email_code?: string }) =>
    request<{ token: string; user: any }>('/api/auth/sign-up', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request<{ user: any }>('/api/user/me'),
  getAuthConfig: () => request<any>('/api/public/auth-config'),
  sendSignupEmailCode: (email: string) =>
    request('/api/auth/send-email-code', { method: 'POST', body: JSON.stringify({ email }) }),

  // Domains (public)
  getDomains: () => request<{ domains: any[] }>('/api/domains'),
  searchNicNamesDomains: (q: string) =>
    request<{ query: string; status: string; count: number; bundle_count?: number; source_url: string; results: any[]; bundles?: any[] }>(`/api/nicnames/domain-search?q=${encodeURIComponent(q)}`),
  getReportCaptcha: () =>
    request<{ question: string; token: string; expires_in: number }>('/api/public/report-captcha'),
  submitReport: (data: { site_name?: string; site_url?: string; reason_type?: string; reason: string; contact?: string; captcha_token: string; captcha_answer: string }) =>
    request<{ success: boolean; id: number; message: string }>('/api/public/reports', { method: 'POST', body: JSON.stringify(data) }),
  getFeaturedSites: () =>
    request<{ items: any[] }>('/api/public/featured-sites'),
  submitFeaturedSite: (data: { site_name: string; site_url: string; owner_name?: string; avatar_url?: string; description: string; contact?: string; captcha_token: string; captcha_answer: string }) =>
    request<{ success: boolean; id: number; message: string }>('/api/public/featured-sites', { method: 'POST', body: JSON.stringify(data) }),

  // Subdomains (authenticated)
  getMySubdomains: () => request<{ subdomains: any[] }>('/api/subdomains'),
  checkSubdomain: (data: { prefix: string; root_domain: string }) =>
    request<{ available: boolean; price?: number; reason?: string }>('/api/subdomains/check', { method: 'POST', body: JSON.stringify(data) }),
  registerSubdomain: (data: { prefix: string; root_domain: string }) =>
    request<{ subdomain: any }>('/api/subdomains/register', { method: 'POST', body: JSON.stringify(data) }),
  deleteSubdomain: (id: number) =>
    request(`/api/subdomains/${id}`, { method: 'DELETE' }),

  // DNS Records
  getRecords: (subdomainId: number) =>
    request<{ records: any[] }>(`/api/subdomains/${subdomainId}/records`),
  createRecord: (subdomainId: number, data: { type: string; name: string; content: string; ttl?: number }) =>
    request(`/api/subdomains/${subdomainId}/records`, { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (subdomainId: number, recordId: number, data: { type: string; name: string; content: string; ttl?: number }) =>
    request(`/api/subdomains/${subdomainId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecord: (subdomainId: number, recordId: number) =>
    request(`/api/subdomains/${subdomainId}/records/${recordId}`, { method: 'DELETE' }),

  // Credits
  getCredits: () => request<{ credits: number; transactions: any[] }>('/api/credits/transactions'),
  redeemCode: (code: string) =>
    request<{ credits: number }>('/api/credits/redeem', { method: 'POST', body: JSON.stringify({ code }) }),

  // Activity
  getActivity: () => request<{ activities: any[] }>('/api/activity'),

  // API Keys
  getApiKeys: () => request<{ keys: any[] }>('/api/api-keys'),
  createApiKey: (name: string) =>
    request<{ key: any }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteApiKey: (id: number) =>
    request(`/api/api-keys/${id}`, { method: 'DELETE' }),

  // Invite
  getInvite: () => request<{ code: string; link: string; count: number; earnings: number; records: any[] }>('/api/user/invite'),
  updateInviteCode: (code: string) =>
    request('/api/user/invite', { method: 'PUT', body: JSON.stringify({ code }) }),

  // Settings
  changePassword: (data: { current_password: string; new_password: string }) =>
    request('/api/user/change-password', { method: 'POST', body: JSON.stringify(data) }),
  changeEmail: (data: { email: string; code?: string }) =>
    request('/api/user/change-email', { method: 'POST', body: JSON.stringify(data) }),
  sendEmailCode: (email: string) =>
    request('/api/user/send-code', { method: 'POST', body: JSON.stringify({ email }) }),

  // Admin
  adminGetStats: () => request<{ users: number; subdomains: number; records: number; pending: number; today_users: number; today_subdomains: number; today_dns_records: number }>('/api/admin/stats'),
  adminGetUsers: (params?: { search?: string }) =>
    request<{ users: any[] }>('/api/admin/users' + (params?.search ? `?search=${encodeURIComponent(params.search)}` : '')),
  adminGrantCredits: (userId: number, amount: number, reason?: string) =>
    request(`/api/admin/users/${userId}/credits`, { method: 'POST', body: JSON.stringify({ amount, description: reason }) }),
  adminBanUser: (userId: number) =>
    request(`/api/admin/users/${userId}/ban`, { method: 'POST' }),
  adminUnbanUser: (userId: number) =>
    request(`/api/admin/users/${userId}/unban`, { method: 'POST' }),
  adminUpdateRole: (userId: number, role: string) =>
    request(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  adminBulkGrantCredits: (data: { mode?: 'per_user' | 'by_group'; amounts?: { user_id: number; amount: number }[]; group_id?: number; amount?: number; reason?: string }) =>
    request<{ success: boolean; updated: number }>('/api/admin/users/bulk-grant-credits', { method: 'POST', body: JSON.stringify(data) }),
  adminGetGroups: () => request<{ groups: any[] }>('/api/admin/groups'),
  adminCreateGroup: (name: string) =>
    request<{ success: boolean; group: any }>('/api/admin/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  adminDeleteGroup: (id: number) =>
    request(`/api/admin/groups/${id}`, { method: 'DELETE' }),
  adminRenameGroup: (id: number, name: string) =>
    request(`/api/admin/groups/${id}/name`, { method: 'PUT', body: JSON.stringify({ name }) }),
  adminGetGroupMembers: (id: number) =>
    request<{ members: any[]; group_name: string }>(`/api/admin/groups/${id}/members`),
  adminAddGroupMember: (groupId: number, userId: number) =>
    request(`/api/admin/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  adminRemoveGroupMember: (groupId: number, userId: number) =>
    request(`/api/admin/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  adminGetNotifications: () => request<{ notifications: any[] }>('/api/admin/notifications'),
  adminCreateNotification: (data: { title: string; content: string; user_id?: number }) =>
    request('/api/admin/notifications', { method: 'POST', body: JSON.stringify(data) }),
  adminCreateRedeemCodes: (data: { amount: number; count?: number; prefix?: string }) =>
    request<{ codes: string[]; count: number; amount: number }>('/api/admin/redeem-codes', { method: 'POST', body: JSON.stringify(data) }),
  adminGetAllSubdomains: (params?: { search?: string }) =>
    request<{ subdomains: any[] }>('/api/admin/subdomains' + (params?.search ? `?search=${encodeURIComponent(params.search)}` : '')),
  adminReleaseSubdomain: (id: number) =>
    request(`/api/admin/subdomains/${id}`, { method: 'DELETE' }),
  adminGetAllRecords: (params?: { search?: string }) =>
    request<{ records: any[] }>('/api/admin/dns-records' + (params?.search ? `?search=${encodeURIComponent(params.search)}` : '')),
  adminDeleteRecord: (id: number) =>
    request(`/api/admin/dns-records/${id}`, { method: 'DELETE' }),
  adminGetSystemDomains: () => request<{ domains: any[] }>('/api/admin/system-domains'),
  adminAddSystemDomain: (domain: string) =>
    request('/api/admin/system-domains', { method: 'POST', body: JSON.stringify({ domain }) }),
  adminRemoveSystemDomain: (id: number) =>
    request(`/api/admin/system-domains/${id}`, { method: 'DELETE' }),
  adminDeleteUser: (userId: number) =>
    request(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  adminUpdateDomainDistribution: (id: number, data: { paused: boolean; reason?: string }) =>
    request(`/api/admin/system-domains/${id}/distribution`, { method: 'PUT', body: JSON.stringify(data) }),
  adminGetHttpsStatus: () => request<{ domains: any[] }>('/api/admin/https/status'),
  adminProvisionDomainHttps: (id: number) =>
    request(`/api/admin/system-domains/${id}/https/provision`, { method: 'POST' }),
  adminGetReservedPrefixes: () => request<{ prefixes: any[] }>('/api/admin/reserved-prefixes'),
  adminAddReservedPrefix: (prefix: string) =>
    request('/api/admin/reserved-prefixes', { method: 'POST', body: JSON.stringify({ prefix }) }),
  adminDeleteReservedPrefix: (id: number) =>
    request(`/api/admin/reserved-prefixes/${id}`, { method: 'DELETE' }),
  adminGetPremiumPrefixes: () => request<{ prefixes: any[] }>('/api/admin/premium-prefixes'),
  adminAddPremiumPrefix: (prefix: string, price_multiplier: number) =>
    request('/api/admin/premium-prefixes', { method: 'POST', body: JSON.stringify({ prefix, price_multiplier }) }),
  adminDeletePremiumPrefix: (id: number) =>
    request(`/api/admin/premium-prefixes/${id}`, { method: 'DELETE' }),
  adminGetModeration: () => request<{ items: any[] }>('/api/admin/moderation'),
  adminApproveModeration: (id: number) =>
    request(`/api/admin/moderation/${id}/approve`, { method: 'POST' }),
  adminRejectModeration: (id: number, reason?: string) =>
    request(`/api/admin/moderation/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminGetShowcaseSites: () => request<{ items: any[] }>('/api/admin/showcase-sites'),
  adminCreateShowcaseSite: (data: { site_name: string; site_url: string; owner_name?: string; avatar_url?: string; description: string; status?: string }) =>
    request('/api/admin/showcase-sites', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateShowcaseSite: (id: number, data: { site_name?: string; site_url?: string; owner_name?: string; avatar_url?: string; description?: string; status?: string }) =>
    request(`/api/admin/showcase-sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteShowcaseSite: (id: number) =>
    request(`/api/admin/showcase-sites/${id}`, { method: 'DELETE' }),
  adminGetAuditLogs: (params?: { search?: string }) =>
    request<{ logs: any[] }>('/api/admin/audit-logs' + (params?.search ? `?search=${encodeURIComponent(params.search)}` : '')),
  adminGetSettings: () => request<{ settings: any[] }>('/api/admin/settings'),
  adminGetSecurity: () => request<{ config: any; blocked_ips: any[]; blocked_count: number }>('/api/admin/security'),
  adminUnblockIp: (ip: string) =>
    request(`/api/admin/security/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE' }),
  adminUpdateSetting: (key: string, value: string) =>
    request('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  adminUpdateSettings: (data: Record<string, string>) =>
    request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
  adminTestEmail: (email: string) =>
    request('/api/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ email }) }),
  adminDeleteSetting: (key: string) =>
    request(`/api/admin/settings/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  // IP Fingerprint
  submitFingerprint: (data: Record<string, any>) =>
    request('/api/user/fingerprint', { method: 'POST', body: JSON.stringify(data) }),
  getMyFingerprints: () =>
    request<{ fingerprints: any[] }>('/api/user/fingerprint'),
  adminGetFingerprints: (params?: { search?: string; page?: number }) => {
    let path = '/api/admin/users/fingerprints'
    const qs: string[] = []
    if (params?.search) qs.push(`search=${encodeURIComponent(params.search)}`)
    if (params?.page) qs.push(`page=${params.page}`)
    if (qs.length) path += '?' + qs.join('&')
    return request<{ fingerprints: any[]; total: number; page: number }>(path)
  },
  adminGetUserDetailFingerprints: (userId: number) =>
    request<{ user: any; fingerprints: any[] }>(`/api/admin/users/${userId}/fingerprints`),
  adminGetAllFingerprints: (params?: { search?: string; page?: number; limit?: number; anonymous?: boolean; action?: string }) => {
    let path = '/api/admin/fingerprints/all'
    const qs: string[] = []
    if (params?.search) qs.push(`search=${encodeURIComponent(params.search)}`)
    if (params?.page) qs.push(`page=${params.page}`)
    if (params?.limit) qs.push(`limit=${params.limit}`)
    if (params?.anonymous) qs.push(`anonymous=true`)
    if (params?.action) qs.push(`action=${encodeURIComponent(params.action)}`)
    if (qs.length) path += '?' + qs.join('&')
    return request<{ fingerprints: any[]; total: number; page: number; anonymous_count: number; user_count: number }>(path)
  },
}
