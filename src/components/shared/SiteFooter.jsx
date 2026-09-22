import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { DiscordIcon, GithubIcon, InstagramIcon, YoutubeIcon } from './SocialIcons'
import WhatsAppIcon from './WhatsAppIcon'
import { APP_VERSION } from '../../lib/appVersion'

// Mesmo formato do rodape do site oficial (tscbr.com.br), com as cores do WebCond.
// O numero nao aparece escrito: o contato e sempre pelo botao do WhatsApp, ja com a mensagem pronta.
const WHATSAPP_NUMBER = '5581997243724'
const WHATSAPP_MESSAGE = 'Ola, queria mais informacoes sobre o WebCond'

export const COMPANY = {
  whatsapp: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,
  email: 'techsocompany@gmail.com',
  site: 'https://www.tscbr.com.br/',
  socials: [
    { label: 'Instagram', href: 'https://www.instagram.com/techsolution.company/', Icon: InstagramIcon },
    { label: 'YouTube', href: 'https://www.youtube.com/@technologySolutionCompany', Icon: YoutubeIcon },
    { label: 'GitHub', href: 'https://github.com/TechnologySolutionCompany', Icon: GithubIcon },
    { label: 'Discord', href: 'https://discord.gg/K7HHTSaz5A', Icon: DiscordIcon },
  ],
}

export const FOOTER_POLICIES = [
  { label: 'Privacidade', to: '/politicas/privacidade' },
  { label: 'Segurança', to: '/politicas/seguranca' },
  { label: 'Cookies', to: '/politicas/cookies' },
]

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div>
          <div className="site-footer-brand">
            <img src="/logo.png" alt="" aria-hidden="true" />
            <span>
              <span className="site-footer-brand-web">Web</span>
              <span className="site-footer-brand-cond">Cond</span>
            </span>
          </div>
          <p className="site-footer-tagline">
            Gestao condominial simples e completa, por unidade, do sindico ao morador.
          </p>
          <div className="site-footer-socials">
            {COMPANY.socials.map(({ label, href, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                <Icon size={14} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <div className="site-footer-title">Navegacao</div>
          <nav className="site-footer-links">
            <Link to="/?cadastro=condominio">Cadastrar condominio</Link>
            <a href={COMPANY.site} target="_blank" rel="noopener noreferrer">Site da TSCBr</a>
          </nav>
        </div>

        <div>
          <div className="site-footer-title">Contato</div>
          <div className="site-footer-links">
            <a href={`mailto:${COMPANY.email}`}><Mail size={12} /> {COMPANY.email}</a>
          </div>
          <a className="site-footer-whatsapp" href={COMPANY.whatsapp} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={14} color="#fff" /> WhatsApp
          </a>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© 2026 Technology Solution Company BR — Todos os direitos reservados. · {APP_VERSION}</span>
        <div className="site-footer-policies">
          {FOOTER_POLICIES.map((policy) => (
            <Link key={policy.to} to={policy.to}>{policy.label}</Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
