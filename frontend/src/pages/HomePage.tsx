import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  return (
    <div>
      <section style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'5rem 1.5rem 3rem' }}>
        <h1 style={{ fontSize:'2.75rem', fontWeight:800, lineHeight:1.1, maxWidth:'40rem', letterSpacing:'-0.025em' }}>
          你的域名，即刻部署
        </h1>
        <p style={{ marginTop:'1rem', fontSize:'1.125rem', color:'var(--text-secondary)', maxWidth:'32rem', lineHeight:1.625 }}>
          认领域名、配置 DNS 记录，几秒钟让你的项目上线。简单、快速，由 NicNames 驱动。
        </p>
        <button className="btn btn-primary btn-lg" style={{ marginTop:'2rem' }} onClick={() => navigate('/available-domains')}>
          开始使用
        </button>
      </section>

      <section style={{ textAlign:'center', padding:'3rem 1.5rem', borderTop:'1px solid var(--border)' }}>
        <h2 style={{ fontSize:'1.125rem', fontWeight:600, marginBottom:'0.5rem' }}>赞助与基础设施</h2>
        <p style={{ fontSize:'0.875rem', color:'var(--text-secondary)', marginBottom:'1.5rem' }}>
          感谢以下支持者，让这个平台对所有人免费开放
        </p>
        <div style={{ display:'flex', justifyContent:'center', gap:'1rem', flexWrap:'wrap' }}>
          <SponsorCard name="谷歌云" href="https://cloud.google.com" />
          <SponsorCard name="NicNames" href="https://nicnames.com" />
        </div>
      </section>
    </div>
  )
}

function SponsorCard({ name, href }: { name: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1rem',
        borderRadius:'var(--radius)', border:'1px solid var(--border)', fontSize:'0.875rem',
        color:'var(--text-secondary)' }}>
      {name}
    </a>
  )
}
