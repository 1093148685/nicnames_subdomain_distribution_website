import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'
import { SITE_LOGO_URL } from '../components/SiteLogo'
import { VerificationStampSvg } from '../components/VerificationStamp'

type FeaturedSite = {
  id: number
  site_name?: string
  site_url?: string
  owner_name?: string
  avatar_url?: string
  reason?: string
  created_at?: string
}

function ConfirmRedirectModal({ site, onClose }: { site: FeaturedSite; onClose: () => void }) {
  const url = site.site_url || '#'
  const name = site.site_name || url
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal confirm-redirect-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="confirm-redirect-body">
          <div className="confirm-redirect-seal">
            <VerificationStampSvg />
          </div>
          <h2>即将跳转至外部站点</h2>
          <p className="confirm-redirect-name">{name}</p>
          <p className="confirm-redirect-url">{url}</p>
          <p className="confirm-redirect-hint">本站点已通过平台安全审核认证，请放心访问。</p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>取消</button>
          <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer" onClick={onClose}>确认访问</a>
        </div>
      </div>
    </div>
  )
}

const fallbackSites: FeaturedSite[] = [
  { id: -1, site_name: 'DNS.ccocc', site_url: 'https://dns.ccocc.cyou', reason: '免费二级域名分发与 DNS 自助管理平台。' },
]

function cleanDescription(reason?: string) {
  return (reason || '')
    .replace(/^类型：站点展示申请\n说明：/, '')
    .split('\n联系方式：')[0]
    .split('\n提交 IP：')[0]
    .trim()
}

function siteUsername(site?: FeaturedSite) {
  return site?.owner_name || '@dns.ccocc'
}

function avatarUrl(site?: FeaturedSite) {
  return site?.avatar_url || SITE_LOGO_URL
}

function FeaturedCard({ site, onClick }: { site: FeaturedSite; onClick: () => void }) {
  const title = site.site_name || site.site_url || '优质站点'
  const quote = cleanDescription(site.reason) || '这个站点已经通过平台审核，欢迎访问体验。'
  return (
    <div className="GlassMarqueeCard" onClick={onClick}>
      <VerificationStampSvg className="verification-stamp" />
      <div className="glass-card-head">
        <img className="glass-card-avatar" alt={title} src={avatarUrl(site)} onError={e => { (e.currentTarget as HTMLImageElement).src = SITE_LOGO_URL }} />
        <div className="glass-card-title">
          <figcaption>{title}</figcaption>
          <p>{siteUsername(site)}</p>
        </div>
      </div>
      <blockquote>“{quote}”</blockquote>
    </div>
  )
}

export default function FeaturedSitesPage() {
  const [items, setItems] = useState<FeaturedSite[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingSite, setPendingSite] = useState<FeaturedSite | null>(null)
  const [viewMode, setViewMode] = useState<'dynamic' | 'static'>(() => (localStorage.getItem('featured-sites-view') as 'dynamic' | 'static') || 'dynamic')
  const marqueeRef = useRef<HTMLDivElement | null>(null)

  const loadSites = async () => {
    setLoading(true)
    try {
      const data = await api.getFeaturedSites()
      setItems(data.items || [])
    } catch (err: any) {
      showToast(err.message || '优质站点加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSites() }, [])
  useEffect(() => {
    if (marqueeRef.current) marqueeRef.current.style.animationPlayState = 'running'
  }, [items])

  const switchViewMode = (mode: 'dynamic' | 'static') => {
    setViewMode(mode)
    localStorage.setItem('featured-sites-view', mode)
  }

  const displayItems = items.length > 0 ? items : fallbackSites
  const topMarqueeItems = Array.from(
    { length: Math.max(12, displayItems.length * 3) },
    (_, index) => displayItems[index % displayItems.length]
  )
  const bottomMarqueeItems = Array.from(
    { length: Math.max(12, displayItems.length * 3) },
    (_, index) => displayItems[(index + Math.ceil(displayItems.length / 2)) % displayItems.length]
  )

  return (
    <div className="page featured-sites-page">
      <div className="featured-hero">
        <span className="badge badge-primary">SHOWCASE</span>
        <h1>优质站点</h1>
        <p className="page-desc">展示用户搭建的优秀网站，提交后由管理员审核，通过后公开展示。</p>
        <div className="featured-actions">
          <div className="featured-view-toggle" role="tablist" aria-label="站点展示方式">
            <button className={viewMode === 'dynamic' ? 'active' : ''} onClick={() => switchViewMode('dynamic')} role="tab" aria-selected={viewMode === 'dynamic'}>动态展示</button>
            <button className={viewMode === 'static' ? 'active' : ''} onClick={() => switchViewMode('static')} role="tab" aria-selected={viewMode === 'static'}>静态网格</button>
          </div>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>提交站点</button>
        </div>
      </div>

      {viewMode === 'dynamic' ? (
        <div className="GlassMarqueeShell">
          <div className="GlassMarqueeGlow GlassMarqueeGlowA" />
          <div className="GlassMarqueeGlow GlassMarqueeGlowB" />
          <div id="marquee-container" className="GlassMarqueeRows" ref={marqueeRef}>
            <div className="GlassMarqueeContainer GlassMarqueeTop">
              {topMarqueeItems.map((site, index) => <FeaturedCard key={`top-${site.id}-${index}`} site={site} onClick={() => setPendingSite(site)} />)}
            </div>
            <div className="GlassMarqueeContainer GlassMarqueeBottom">
              {bottomMarqueeItems.map((site, index) => <FeaturedCard key={`bottom-${site.id}-${index}`} site={site} onClick={() => setPendingSite(site)} />)}
            </div>
          </div>
        </div>
      ) : (
        <div className="featured-static-shell">
          <div className="featured-static-grid">
            {displayItems.map(site => {
              const title = site.site_name || site.site_url || '优质站点'
              return (
                <div key={`static-${site.id}`} className="featured-static-card" onClick={() => setPendingSite(site)}>
                  <VerificationStampSvg className="verification-stamp-static" />
                  <img alt={title} src={avatarUrl(site)} onError={e => { (e.currentTarget as HTMLImageElement).src = SITE_LOGO_URL }} />
                  <span>{title}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state featured-empty-state">
          <p>还没有审核通过的用户站点</p>
          <p>注册域名并搭建网站后，点击「提交站点」申请展示。</p>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>提交站点</button>
        </div>
      )}

      {modalOpen && <FeaturedSiteModal onClose={() => setModalOpen(false)} onSubmitted={loadSites} />}
      {pendingSite && <ConfirmRedirectModal site={pendingSite} onClose={() => setPendingSite(null)} />}
    </div>
  )
}

function FeaturedSiteModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [form, setForm] = useState({ site_name: '', site_url: '', owner_name: '', avatar_url: '', description: '', contact: '', captcha_answer: '' })
  const [captcha, setCaptcha] = useState<{ question: string; token: string } | null>(null)
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = async () => {
    setLoadingCaptcha(true)
    try {
      const data = await api.getReportCaptcha()
      setCaptcha({ question: data.question, token: data.token })
      setForm(prev => ({ ...prev, captcha_answer: '' }))
    } catch (err: any) {
      showToast(err.message || '验证码加载失败', 'error')
    } finally {
      setLoadingCaptcha(false)
    }
  }

  useEffect(() => { refreshCaptcha() }, [])

  const submit = async () => {
    if (!captcha) return showToast('请先获取验证码', 'error')
    if (!form.site_name.trim()) return showToast('请填写站点名称', 'error')
    if (!form.site_url.trim()) return showToast('请填写站点 URL', 'error')
    if (form.description.trim().length < 8) return showToast('请补充至少 8 个字的站点介绍', 'error')
    if (!form.captcha_answer.trim()) return showToast('请填写验证码答案', 'error')
    setSubmitting(true)
    try {
      const res = await api.submitFeaturedSite({ ...form, captcha_token: captcha.token })
      showToast(res.message || '站点已提交，等待后台审核', 'success')
      onClose()
      onSubmitted()
    } catch (err: any) {
      showToast(err.message || '提交失败', 'error')
      refreshCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal report-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>提交优质站点</h2>
        <p>提交后进入后台审核，通过后显示在玻璃拟态展示墙。</p>
        <div className="form-group">
          <label>站点名称</label>
          <input className="input" value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })} placeholder="例如：我的技术博客" />
        </div>
        <div className="form-group">
          <label>站点 URL</label>
          <input className="input" value={form.site_url} onChange={e => setForm({ ...form, site_url: e.target.value })} placeholder="https://example.ccocc.cyou" />
        </div>
        <div className="form-group">
          <label>所属用户名（可选）</label>
          <input className="input" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="不填默认 @dns.ccocc" />
        </div>
        <div className="form-group">
          <label>头像 URL（可选）</label>
          <input className="input" value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="不填使用后台默认头像" />
        </div>
        <div className="form-group">
          <label>站点介绍</label>
          <textarea className="input" rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="请介绍站点内容、特色、适合展示的原因" />
        </div>
        <div className="form-group">
          <label>联系方式（可选）</label>
          <input className="input" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="邮箱或 QQ，便于审核沟通" />
        </div>
        <div className="form-group captcha-row">
          <label>验证码</label>
          <div className="captcha-box">
            <span>{loadingCaptcha ? '加载中...' : captcha?.question || '未获取'}</span>
            <button className="btn btn-outline btn-sm" onClick={refreshCaptcha} disabled={loadingCaptcha || submitting}>刷新</button>
          </div>
          <input className="input" value={form.captcha_answer} onChange={e => setForm({ ...form, captcha_answer: e.target.value })} placeholder="请输入计算结果" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || loadingCaptcha}>{submitting ? '提交中...' : '提交审核'}</button>
        </div>
      </div>
    </div>
  )
}
