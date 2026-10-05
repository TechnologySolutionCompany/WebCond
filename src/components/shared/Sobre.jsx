import { Link } from 'react-router-dom'
import { ExternalLink, Globe, Mail, ShieldCheck } from 'lucide-react'
import WhatsAppIcon from './WhatsAppIcon'
import { COMPANY, FOOTER_POLICIES } from './SiteFooter'
import { APP_VERSION, APP_VERSION_INFO } from '../../lib/appVersion'
import { whatsappUrl } from '../../lib/contato'

// Suporte > Sobre (v1.09A5): o que e o WebCond, a versao instalada e o contato direto com a TSCBr.
// E tambem para onde foram as informacoes que saíram da tela inicial (rodape).
export default function Sobre() {
  const mensagemSuporte = `Ola, preciso de suporte no WebCond (versao ${APP_VERSION}).`

  return (
    <div className="me-panel sobre">
      <div className="sobre-head">
        <img src="/logo.png" alt="" aria-hidden="true" className="sobre-logo" />
        <div>
          <div className="sobre-marca"><span className="sobre-web">Web</span><span className="sobre-cond">Cond</span></div>
          <div className="sobre-tag">Gestao condominial simples e completa, do sindico ao morador.</div>
        </div>
      </div>

      <p className="sobre-texto">
        O WebCond organiza a vida do condominio em um lugar so: cobrancas por unidade com boleto e Pix,
        avisos e documentos, ocorrencias e o cadastro dos moradores. Funciona no navegador e pode ser
        instalado no celular como aplicativo.
      </p>

      <div className="me-rows">
        <div className="me-row"><span>Versao do app</span><strong>{APP_VERSION}</strong></div>
        <div className="me-row"><span>Tipo da atualizacao</span><strong>{APP_VERSION_INFO.tipo} · ajuste {APP_VERSION_INFO.ajuste}</strong></div>
        <div className="me-row"><span>Desenvolvido por</span><strong>TSCBr · Technology Solution Company BR</strong></div>
      </div>

      <div className="sobre-contato">
        <a className="btn btn-primary" href={whatsappUrl(mensagemSuporte)} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon size={14} color="#fff" /> Falar com o suporte da TSCBr
        </a>
        <a className="btn btn-ghost" href={`mailto:${COMPANY.email}?subject=${encodeURIComponent(`Suporte WebCond ${APP_VERSION}`)}`}>
          <Mail size={14} /> {COMPANY.email}
        </a>
        <a className="btn btn-ghost" href={COMPANY.site} target="_blank" rel="noopener noreferrer">
          <Globe size={14} /> tscbr.com.br <ExternalLink size={12} />
        </a>
      </div>

      <div className="sobre-redes" aria-label="Redes da TSCBr">
        {COMPANY.socials.map(({ label, href, Icon }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
            <Icon size={15} />
          </a>
        ))}
      </div>

      <div className="sobre-politicas">
        <ShieldCheck size={13} />
        {FOOTER_POLICIES.map((policy) => (
          <Link key={policy.to} to={policy.to}>{policy.label}</Link>
        ))}
      </div>

      <div className="sobre-copy">© 2026 Technology Solution Company BR. Todos os direitos reservados.</div>
    </div>
  )
}
