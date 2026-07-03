import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ToastProvider } from './components/Toast'
import { submitFingerprint } from './utils/fingerprint'
import PublicHeader from './components/PublicHeader'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import AuthModal from './components/AuthModal'

// Public pages
import HomePage from './pages/HomePage'
import AvailableDomainsPage from './pages/AvailableDomainsPage'
import WhoisPage from './pages/WhoisPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'
import FeaturedSitesPage from './pages/FeaturedSitesPage'
import SitemapPage from './pages/SitemapPage'
import { AboutPage, TermsPage, PrivacyPage, ContactPage, ReportPage, PromoPage } from './pages/StaticInfoPages'

// Console pages
import DashboardPage from './pages/DashboardPage'
import RegisterDomainPage from './pages/RegisterDomainPage'
import DomainSearchPage from './pages/DomainSearchPage'
import MyDomainsPage from './pages/MyDomainsPage'
import DNSManagePage from './pages/DNSManagePage'
import InvitePage from './pages/InvitePage'
import CreditsPage from './pages/CreditsPage'
import ActivityPage from './pages/ActivityPage'
import ApiKeysPage from './pages/ApiKeysPage'
import DeveloperPage from './pages/DeveloperPage'
import SettingsPage from './pages/SettingsPage'

// Admin pages
import AdminOverviewPage from './pages/AdminOverviewPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminDomainsPage from './pages/AdminDomainsPage'
import AdminReservedPrefixesPage from './pages/AdminReservedPrefixesPage'
import AdminPremiumPrefixesPage from './pages/AdminPremiumPrefixesPage'
import AdminModerationPage from './pages/AdminModerationPage'
import AdminShowcaseSitesPage from './pages/AdminShowcaseSitesPage'
import AdminAuditLogsPage from './pages/AdminAuditLogsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AdminFingerprintsPage from './pages/AdminFingerprintsPage'

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return <div className="page route-page">{children}</div>
}

function PublicLayout({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="public-layout">
      <PublicHeader onSignIn={onSignIn} onSignUp={onSignUp} />
      <main className="public-main route-page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/available-domains" element={<AvailableDomainsPage />} />
          <Route path="/domain-search" element={<DomainSearchPage />} />
          <Route path="/whois" element={<WhoisPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/featured-sites" element={<FeaturedSitesPage />} />
          <Route path="/sitemap" element={<SitemapPage />} />
          <Route path="/promo" element={<PromoPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/tos" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/abuse" element={<ReportPage />} />
        </Routes>
      </main>
      <footer className="public-footer">
        <p>&copy; 2026 DNS.ccocc · 免费域名服务</p>
      </footer>
    </div>
  )
}

function ConsoleLayout({ onSignOut }: { onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/" replace />

  const toggleSidebar = () => setSidebarOpen(v => !v)

  return (
    <div className="console-layout localhost-activity-mode">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onSignOut={onSignOut} />
      <div className="console-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<><Topbar title="仪表盘" onToggleSidebar={toggleSidebar} /><AnimatedPage><DashboardPage /></AnimatedPage></>} />
          <Route path="/register" element={<><Topbar title="注册域名" onToggleSidebar={toggleSidebar} /><AnimatedPage><RegisterDomainPage /></AnimatedPage></>} />
          <Route path="/domain-search" element={<><Topbar title="官网域名搜索" onToggleSidebar={toggleSidebar} /><AnimatedPage><DomainSearchPage /></AnimatedPage></>} />
          <Route path="/my-domains" element={<><Topbar title="我的域名" onToggleSidebar={toggleSidebar} /><AnimatedPage><MyDomainsPage /></AnimatedPage></>} />
          <Route path="/my-domains/:id" element={<><Topbar title="DNS 管理" onToggleSidebar={toggleSidebar} /><AnimatedPage><DNSManagePage /></AnimatedPage></>} />
          <Route path="/invite" element={<><Topbar title="邀请好友" onToggleSidebar={toggleSidebar} /><AnimatedPage><InvitePage /></AnimatedPage></>} />
          <Route path="/credits" element={<><Topbar title="积分中心" onToggleSidebar={toggleSidebar} /><AnimatedPage><CreditsPage /></AnimatedPage></>} />
          <Route path="/activity" element={<><Topbar title="活动记录" onToggleSidebar={toggleSidebar} /><AnimatedPage><ActivityPage /></AnimatedPage></>} />
          <Route path="/api-keys" element={<><Topbar title="API 管理" onToggleSidebar={toggleSidebar} /><AnimatedPage><ApiKeysPage /></AnimatedPage></>} />
          <Route path="/developer" element={<><Topbar title="开发者奖励" onToggleSidebar={toggleSidebar} /><AnimatedPage><DeveloperPage /></AnimatedPage></>} />
          <Route path="/settings" element={<><Topbar title="账号设置" onToggleSidebar={toggleSidebar} /><AnimatedPage><SettingsPage /></AnimatedPage></>} />
          {user?.role === 'admin' && (
            <>
              <Route path="/admin" element={<><Topbar title="管理概览" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminOverviewPage /></AnimatedPage></>} />
              <Route path="/admin/users" element={<><Topbar title="用户管理" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminUsersPage /></AnimatedPage></>} />
              <Route path="/admin/domains" element={<><Topbar title="域名管理" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminDomainsPage /></AnimatedPage></>} />
              <Route path="/admin/reserved-prefixes" element={<><Topbar title="保留前缀" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminReservedPrefixesPage /></AnimatedPage></>} />
              <Route path="/admin/premium-prefixes" element={<><Topbar title="高级前缀" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminPremiumPrefixesPage /></AnimatedPage></>} />
              <Route path="/admin/moderation" element={<><Topbar title="审核管理" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminModerationPage /></AnimatedPage></>} />
              <Route path="/admin/showcase-sites" element={<><Topbar title="站点展示" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminShowcaseSitesPage /></AnimatedPage></>} />
              <Route path="/admin/audit-logs" element={<><Topbar title="审计日志" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminAuditLogsPage /></AnimatedPage></>} />
              <Route path="/admin/settings" element={<><Topbar title="系统设置" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminSettingsPage /></AnimatedPage></>} />
              <Route path="/admin/fingerprints" element={<><Topbar title="设备指纹" onToggleSidebar={toggleSidebar} /><AnimatedPage><AdminFingerprintsPage /></AnimatedPage></>} />
            </>
          )}
        </Routes>
      </div>
    </div>
  )
}

function AppInner() {
  const [showAuth, setShowAuth] = useState<'signin' | 'signup' | null>(null)
  const { user, signOut, loading } = useAuth()
  const location = useLocation()

  // 自动提交浏览器指纹
  useEffect(() => { submitFingerprint() }, [])
  const publicPaths = ['/', '/available-domains', '/domain-search', '/whois', '/knowledge-base', '/featured-sites', '/sitemap', '/promo', '/about', '/terms', '/tos', '/privacy', '/contact', '/report', '/abuse']
  const isPublicPath = publicPaths.includes(location.pathname) && (location.pathname !== '/domain-search' || !user)
  const isConsolePath = ['/dashboard', '/register', '/domain-search', '/my-domains', '/invite', '/credits', '/activity', '/api-keys', '/developer', '/settings', '/admin'].some(path =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )
  const isActivityPath = isConsolePath

  if (loading && isConsolePath) {
    return (
      <div className={`console-layout ${isActivityPath ? 'localhost-activity-mode' : ''}`}>
        <div className="console-content">
          <main className="page console-loading-page">
            <div className="skeleton" style={{ height: 32, width: 180, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 120, width: '100%', borderRadius: 14 }} />
          </main>
        </div>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/*" element={
          isPublicPath
            ? <PublicLayout onSignIn={() => setShowAuth('signin')} onSignUp={() => setShowAuth('signup')} />
            : <ConsoleLayout onSignOut={signOut} />
        } />
      </Routes>
      {!user && (
        <AuthModal
          open={showAuth !== null}
          defaultMode={showAuth || 'signin'}
          onClose={() => setShowAuth(null)}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  )
}
