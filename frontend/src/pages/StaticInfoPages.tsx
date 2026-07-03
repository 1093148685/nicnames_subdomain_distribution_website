import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { api } from '../api'
import { showToast } from '../components/Toast'

type InfoPageProps = {
  title: string
  desc?: string
  children?: ReactNode
}

function InfoPage({ title, desc, children }: InfoPageProps) {
  return (
    <div className="page public-info-page">
      <div className="info-hero card">
        <span className="badge badge-primary">DNS.ccocc</span>
        <h1>{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card info-card">
      <h2>{title}</h2>
      <div className="info-content">{children}</div>
    </section>
  )
}

export function AboutPage() {
  return (
    <InfoPage title="关于" desc="DNS.ccocc 是面向开发者和个人站长的免费二级域名分发平台。">
      <InfoCard title="我们提供什么">
        <p>你可以在平台提供的根域名下认领自己的二级域名，并自助管理 A、AAAA、CNAME、MX、TXT 等 DNS 记录。</p>
        <p>平台只负责域名分发与 DNS 记录管理，你的网站、服务器、CDN 与 HTTPS 证书由你自己配置。</p>
      </InfoCard>
      <InfoCard title="适合谁使用">
        <ul>
          <li>个人博客、作品集、实验项目</li>
          <li>GitHub Pages、Vercel、Cloudflare Pages 等静态站</li>
          <li>需要临时域名做测试、演示、API 回调的开发者</li>
        </ul>
      </InfoCard>
    </InfoPage>
  )
}

export function TermsPage() {
  return (
    <InfoPage title="服务条款" desc="使用本平台即表示你同意遵守以下规则。">
      <InfoCard title="使用限制">
        <ul>
          <li>不得用于钓鱼、诈骗、恶意软件、垃圾邮件、违法内容或绕过监管。</li>
          <li>不得批量抢注、倒卖、滥用接口或影响平台稳定性。</li>
          <li>平台有权对违规域名进行暂停、回收或删除 DNS 记录。</li>
        </ul>
      </InfoCard>
      <InfoCard title="域名与积分">
        <p>注册域名会按当前规则扣除积分。用户主动释放域名后，已扣积分不退还。</p>
        <p>平台会尽量保持服务稳定，但免费域名服务不承诺永久可用或商业 SLA。</p>
      </InfoCard>
    </InfoPage>
  )
}

export function PrivacyPage() {
  return (
    <InfoPage title="隐私政策" desc="我们只收集提供服务所需的最少信息。">
      <InfoCard title="收集的信息">
        <ul>
          <li>账号信息：用户名、邮箱、登录时间。</li>
          <li>域名信息：你认领的子域名和 DNS 记录。</li>
          <li>安全日志：请求 IP、异常访问、操作审计。</li>
        </ul>
      </InfoCard>
      <InfoCard title="如何使用">
        <p>这些信息仅用于账号登录、域名管理、安全风控、违规处理和必要的系统维护。我们不会公开展示你的邮箱或密码等私密信息。</p>
      </InfoCard>
    </InfoPage>
  )
}

export function ContactPage() {
  return (
    <InfoPage title="联系我们" desc="遇到注册、DNS、滥用或账号问题，可以通过以下方式联系。">
      <InfoCard title="联系方式">
        <div className="contact-methods">
          <a className="contact-method" href="mailto:1093148685@qq.com">
            <span>QQ 邮箱</span>
            <strong>1093148685@qq.com</strong>
          </a>
          <a className="contact-method" href="https://mail.qq.com/cgi-bin/qm_share?t=qm_mailme&email=1093148685@qq.com" target="_blank" rel="noreferrer">
            <span>QQ 邮箱网页版</span>
            <strong>通过 QQ 邮箱写信</strong>
          </a>
        </div>
      </InfoCard>
      <InfoCard title="处理入口">
        <div className="contact-grid">
          <Link className="card card-hover" to="/report">
            <strong>举报滥用</strong>
            <span>站点内弹窗提交，验证码验证后直达后台审核</span>
          </Link>
          <Link className="card card-hover" to="/knowledge-base">
            <strong>查看知识库</strong>
            <span>先看积分规则、DNS 配置和常见问题</span>
          </Link>
          <Link className="card card-hover" to="/dashboard">
            <strong>进入控制台</strong>
            <span>登录后管理域名、DNS 记录和 API Key</span>
          </Link>
        </div>
      </InfoCard>
      <InfoCard title="说明">
        <p>如果是域名解析不生效，请先确认 DNS 记录已保存成功，并等待递归 DNS 缓存刷新。</p>
      </InfoCard>
    </InfoPage>
  )
}

export function ReportPage() {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <InfoPage title="举报滥用" desc="举报违法、钓鱼、诈骗、垃圾邮件或恶意使用的子域名。">
      <InfoCard title="在线提交">
        <p>点击下方按钮填写举报内容，完成验证码后会直接进入后台「审核管理」，管理员可在后台处理。</p>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>弹窗举报提交</button>
      </InfoCard>
      <InfoCard title="举报前请准备">
        <ul>
          <li>完整域名或 URL，例如 https://example.ccocc.cyou/path</li>
          <li>违规类型：钓鱼、诈骗、恶意软件、spam、侵权或其他</li>
          <li>必要证据：截图链接、说明、受影响页面</li>
        </ul>
      </InfoCard>
      <InfoCard title="处理流程">
        <p>平台会根据举报内容进行核验。确认违规后，会暂停相关子域名或删除 DNS 记录；严重滥用会封禁账号。</p>
      </InfoCard>
      {modalOpen && <ReportModal onClose={() => setModalOpen(false)} />}
    </InfoPage>
  )
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ site_url: '', site_name: '', reason_type: '钓鱼/诈骗', reason: '', contact: '', captcha_answer: '' })
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
    if (!form.site_url.trim() && !form.site_name.trim()) return showToast('请填写被举报域名或 URL', 'error')
    if (form.reason.trim().length < 8) return showToast('请补充至少 8 个字的举报说明', 'error')
    if (!form.captcha_answer.trim()) return showToast('请填写验证码答案', 'error')
    setSubmitting(true)
    try {
      const res = await api.submitReport({ ...form, captcha_token: captcha.token })
      showToast(res.message || '举报已提交，后台已收到', 'success')
      onClose()
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
        <h2>举报提交</h2>
        <p>提交后会生成后台审核记录，请尽量写清楚违规页面和证据。</p>
        <div className="form-group">
          <label>被举报 URL</label>
          <input className="input" value={form.site_url} onChange={e => setForm({ ...form, site_url: e.target.value })} placeholder="https://example.ccocc.cyou/path" />
        </div>
        <div className="form-group">
          <label>域名 / 站点名</label>
          <input className="input" value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })} placeholder="example.ccocc.cyou" />
        </div>
        <div className="form-group">
          <label>违规类型</label>
          <select className="input" value={form.reason_type} onChange={e => setForm({ ...form, reason_type: e.target.value })}>
            <option>钓鱼/诈骗</option>
            <option>恶意软件</option>
            <option>垃圾邮件</option>
            <option>违法内容</option>
            <option>侵权</option>
            <option>其他</option>
          </select>
        </div>
        <div className="form-group">
          <label>举报说明 / 证据</label>
          <textarea className="input" rows={4} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="请说明违规内容、截图链接、受影响页面等" />
        </div>
        <div className="form-group">
          <label>联系方式（可选）</label>
          <input className="input" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="邮箱或 QQ，便于补充材料" />
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
          <button className="btn btn-primary" onClick={submit} disabled={submitting || loadingCaptcha}>{submitting ? '提交中...' : '提交举报'}</button>
        </div>
      </div>
    </div>
  )
}

export function PromoPage() {
  return (
    <InfoPage title="新人福利" desc="注册并完成邮箱验证后，可获得新用户积分奖励。">
      <InfoCard title="活动规则">
        <ul>
          <li>新用户完成注册后可获得初始积分。</li>
          <li>邀请好友完成验证后，邀请双方都可以获得额外积分。</li>
          <li>活动名额、奖励额度以平台后台当前设置为准。</li>
        </ul>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/" className="btn btn-primary">返回首页注册</Link>
        </div>
      </InfoCard>
    </InfoPage>
  )
}
