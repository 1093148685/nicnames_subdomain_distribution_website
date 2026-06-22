const API_BASE = '/api';

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      msg = body.detail || body.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

export interface User {
  id: number; username: string; email: string; credits: number;
  whois_privacy: boolean; role: string;
  oidc_provider?: string; oidc_id?: string; oidc_avatar?: string;
}

export interface Domain {
  id: number; name: string; credits: number; description: string;
  source: string; nicnames_id?: string; expiry?: string;
  paused: boolean; distribution_enabled: boolean;
}

export interface Subdomain {
  id: number; prefix: string; root_domain: string; fqdn: string;
  status: string; created_at: string;
}

export interface DNSRecord {
  id: number; subdomain_id: number; record_type: string;
  record_name: string; content: string; ttl: number;
  created_at: string;
}

export interface AuthConfig {
  oidc_enabled: boolean; oidc_providers: string[];
  signup_enabled: boolean; email_verify: boolean;
}

export const api = {
  // Auth
  getAuthConfig: () => request<AuthConfig>('/public/auth-config'),

  nicnamesSearch: (q: string) =>
    request<{ results: any[] }>(`/nicnames/domain-search?q=${encodeURIComponent(q)}`),

  signIn: (data: { username: string; password: string; remember?: boolean; [k: string]: any }) =>
    request<{ token: string; user: User }>('/auth/sign-in', { method: 'POST', body: JSON.stringify(data) }),

  signUp: (data: { username: string; email: string; password: string; email_code?: string; invite_code?: string; [k: string]: any }) =>
    request<{ token: string; user: User }>('/auth/sign-up', { method: 'POST', body: JSON.stringify(data) }),

  sendEmailCode: (data: { email: string }) =>
    request('/auth/send-email-code', { method: 'POST', body: JSON.stringify(data) }),

  // User
  getMe: () => request<{ user: User }>('/user/me'),

  // Domains
  getDomains: () => request<{ domains: Domain[] }>('/domains'),

  // Subdomains
  getSubdomains: () => request<{ subdomains: Subdomain[] }>('/subdomains'),

  checkSubdomain: (data: { prefix: string; root_domain: string }) =>
    request<{ available: boolean; message?: string }>('/subdomains/check', { method: 'POST', body: JSON.stringify(data) }),

  registerSubdomain: (data: { prefix: string; root_domain: string; email_code?: string }) =>
    request<{ subdomain: Subdomain }>('/subdomains/register', { method: 'POST', body: JSON.stringify(data) }),

  deleteSubdomain: (id: number) =>
    request(`/subdomains/${id}`, { method: 'DELETE' }),

  // DNS Records
  getRecords: (subdomainId: number) =>
    request<{ records: DNSRecord[] }>(`/subdomains/${subdomainId}/records`),

  createRecord: (subdomainId: number, data: { record_type: string; record_name: string; content: string; ttl: number }) =>
    request<{ record: DNSRecord }>(`/subdomains/${subdomainId}/records`, { method: 'POST', body: JSON.stringify(data) }),

  updateRecord: (subdomainId: number, recordId: number, data: { record_type: string; record_name: string; content: string; ttl: number }) =>
    request<{ record: DNSRecord }>(`/subdomains/${subdomainId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteRecord: (subdomainId: number, recordId: number) =>
    request(`/subdomains/${subdomainId}/records/${recordId}`, { method: 'DELETE' }),

  // Credits
  getCreditsTransactions: () =>
    request<{ transactions: any[] }>('/credits/transactions'),

  redeemCredits: (data: { code: string }) =>
    request<{ credits: number }>('/credits/redeem', { method: 'POST', body: JSON.stringify(data) }),

  // Activity
  getActivity: () => request<{ items: any[] }>('/activity'),

  // Featured sites
  getFeaturedSites: () => request<{ items: any[] }>('/public/featured-sites'),

  // ── Admin API ──
  // Overview stats
  getAdminStats: () => request<any>('/admin/stats'),
  getAdminSecurity: () => request<any>('/admin/security'),
  getAdminHTTPSStatus: () => request<any>('/admin/https/status'),

  // Users
  getAdminUsers: () => request<{ users: any[] }>('/admin/users'),
  deleteAdminUser: (userId: number) => request(`/admin/users/${userId}`, { method: 'DELETE' }),
  banAdminUser: (userId: number) => request(`/admin/users/${userId}/ban`, { method: 'POST' }),
  unbanAdminUser: (userId: number) => request(`/admin/users/${userId}/unban`, { method: 'POST' }),
  setAdminUserRole: (userId: number, role: string) =>
    request(`/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  setAdminUserCredits: (userId: number, credits: number) =>
    request(`/admin/users/${userId}/credits`, { method: 'POST', body: JSON.stringify({ credits }) }),
  bulkGrantCredits: (userIds: number[], credits: number) =>
    request('/admin/users/bulk-grant-credits', { method: 'POST', body: JSON.stringify({ user_ids: userIds, credits }) }),

  // Subdomains (admin)
  getAdminSubdomains: () => request<{ subdomains: any[] }>('/admin/subdomains'),
  deleteAdminSubdomain: (id: number) => request(`/admin/subdomains/${id}`, { method: 'DELETE' }),

  // DNS records (admin)
  getAdminDNSRecords: () => request<{ records: any[] }>('/admin/dns-records'),
  deleteAdminDNSRecord: (recordId: number) => request(`/admin/dns-records/${recordId}`, { method: 'DELETE' }),

  // Domain management
  getAdminSystemDomains: () => request<{ domains: any[] }>('/admin/system-domains'),
  createAdminSystemDomain: (data: any) =>
    request('/admin/system-domains', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdminSystemDomain: (id: number) => request(`/admin/system-domains/${id}`, { method: 'DELETE' }),
  setAdminDomainDistribution: (id: number, enabled: boolean) =>
    request(`/admin/system-domains/${id}/distribution`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  provisionDomainHTTPS: (id: number) =>
    request(`/admin/system-domains/${id}/https/provision`, { method: 'POST' }),

  // Reserved prefixes
  getAdminReservedPrefixes: () => request<{ prefixes: any[] }>('/admin/reserved-prefixes'),
  createAdminReservedPrefix: (data: { prefix: string; note?: string }) =>
    request('/admin/reserved-prefixes', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdminReservedPrefix: (id: number) => request(`/admin/reserved-prefixes/${id}`, { method: 'DELETE' }),

  // Premium prefixes
  getAdminPremiumPrefixes: () => request<{ prefixes: any[] }>('/admin/premium-prefixes'),
  createAdminPremiumPrefix: (data: any) =>
    request('/admin/premium-prefixes', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdminPremiumPrefix: (id: number) => request(`/admin/premium-prefixes/${id}`, { method: 'DELETE' }),

  // Moderation
  getAdminModeration: () => request<{ items: any[] }>('/admin/moderation'),
  approveModeration: (id: number) => request(`/admin/moderation/${id}/approve`, { method: 'POST' }),
  rejectModeration: (id: number, reason?: string) =>
    request(`/admin/moderation/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Showcase sites
  getAdminShowcaseSites: () => request<{ sites: any[] }>('/admin/showcase-sites'),
  createAdminShowcaseSite: (data: any) =>
    request('/admin/showcase-sites', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminShowcaseSite: (id: number, data: any) =>
    request(`/admin/showcase-sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAdminShowcaseSite: (id: number) => request(`/admin/showcase-sites/${id}`, { method: 'DELETE' }),

  // Audit logs
  getAdminAuditLogs: (query?: string) =>
    request<{ logs: any[] }>(`/admin/audit-logs${query ? `?q=${encodeURIComponent(query)}` : ''}`),

  // Fingerprints
  getAdminFingerprints: () => request<{ fingerprints: any[] }>('/admin/fingerprints/all'),
  getAdminUserFingerprints: (userId: number) =>
    request<{ fingerprints: any[] }>(`/admin/users/${userId}/fingerprints`),

  // System settings
  getAdminSettings: () => request<{ settings: any[] }>('/admin/settings'),
  updateAdminSetting: (key: string, value: any) =>
    request('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  createAdminSetting: (data: { key: string; value: any; type?: string; description?: string }) =>
    request('/admin/settings', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdminSetting: (key: string) => request(`/admin/settings/${key}`, { method: 'DELETE' }),
  sendTestEmail: (email: string) =>
    request('/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ email }) }),

  // Groups
  getAdminGroups: () => request<{ groups: any[] }>('/admin/groups'),
  createAdminGroup: (data: { name: string }) =>
    request('/admin/groups', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdminGroup: (id: number) => request(`/admin/groups/${id}`, { method: 'DELETE' }),
  getAdminGroupMembers: (groupId: number) =>
    request<{ members: any[] }>(`/admin/groups/${groupId}/members`),
  addAdminGroupMember: (groupId: number, userId: number) =>
    request(`/admin/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  removeAdminGroupMember: (groupId: number, userId: number) =>
    request(`/admin/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  // Notifications
  getAdminNotifications: () => request<{ notifications: any[] }>('/admin/notifications'),
  createAdminNotification: (data: any) =>
    request('/admin/notifications', { method: 'POST', body: JSON.stringify(data) }),
  getAdminUnreadCount: () => request<{ count: number }>('/admin/notifications/unread-count'),

  // Redeem codes
  createAdminRedeemCode: (data: { credits: number; max_uses?: number; note?: string; expires_at?: string }) =>
    request('/admin/redeem-codes', { method: 'POST', body: JSON.stringify(data) }),

  // Blocked IPs
  unblockAdminIP: (ip: string) => request(`/admin/security/blocked-ips/${ip}`, { method: 'DELETE' }),
};
