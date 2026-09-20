import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import SiteFooter from '../components/shared/SiteFooter'
import { LAST_UPDATE, POLICIES, POLICY_LIST, POLICY_VERSION } from '../lib/politicas'

// Paginas legais publicas (mesma estrutura do site oficial, nas cores do WebCond).
export default function Politicas() {
  const { slug } = useParams()
  const policy = POLICIES[slug]

  useEffect(() => {
    if (policy) document.title = `${policy.title} | WebCond`
    return () => { document.title = 'WebCond' }
  }, [policy])

  if (!policy) return <Navigate to="/politicas/privacidade" replace />

  return (
    <div className="policy-page">
      <header className="policy-topbar">
        <Link to="/" className="policy-brand">
          <ArrowLeft size={16} />
          <img src="/logo.png" alt="" aria-hidden="true" />
          <span><span className="policy-brand-web">Web</span><span className="policy-brand-cond">Cond</span></span>
        </Link>
        <nav className="policy-topbar-nav">
          {POLICY_LIST.map((item) => (
            <Link key={item.slug} to={`/politicas/${item.slug}`} className={item.slug === policy.slug ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="policy-hero">
        <span className="policy-eyebrow">Documentacao legal</span>
        <h1>{policy.title}</h1>
        <p>{policy.intro}</p>
        <div className="policy-meta">
          Ultima atualizacao: <strong>{LAST_UPDATE}</strong> · Versao <strong>{POLICY_VERSION}</strong>
        </div>
      </section>

      <div className="policy-layout">
        <aside className="policy-sidebar">
          <div className="policy-card">
            <p className="policy-card-title">Nesta pagina</p>
            {policy.sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="policy-toc-link">
                {String(index + 1).padStart(2, '0')}. {section.title}
              </a>
            ))}
          </div>

          <div className="policy-card">
            <p className="policy-card-title">Outras politicas</p>
            {POLICY_LIST.map((item) => (
              <Link key={item.slug} to={`/politicas/${item.slug}`} className={`policy-nav-link ${item.slug === policy.slug ? 'current' : ''}`}>
                <span className="policy-dot" /> {item.label}
              </Link>
            ))}
          </div>

          <div className="policy-card">
            <p className="policy-card-title">Duvidas?</p>
            <p className="policy-card-text">Fale com a administracao da plataforma pelos canais do rodape.</p>
          </div>
        </aside>

        <main className="policy-content">
          <div className="policy-notice">
            <ShieldCheck size={18} />
            <span>{policy.notice}</span>
          </div>

          {policy.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="policy-section">
              <h2><span className="policy-section-num">{String(index + 1).padStart(2, '0')}</span> {section.title}</h2>
              {section.blocks.map((block, blockIndex) => (
                block.type === 'ul' ? (
                  <ul key={blockIndex}>
                    {block.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p key={blockIndex}>{block.text}</p>
                )
              ))}
            </section>
          ))}
        </main>
      </div>

      <SiteFooter />
    </div>
  )
}
