import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, Smartphone, X } from 'lucide-react'
import { canPromptInstall, dismissInstall, isInstallDismissed, isIos, isStandalone, promptInstall, subscribeInstallPrompt } from '../../lib/installPrompt'

// Estado do convite: 'prompt' (Android/Chrome: instala com um toque), 'ios' (passo a passo) ou null.
function useInstallMode() {
  const [, setTick] = useState(0)
  useEffect(() => subscribeInstallPrompt(() => setTick((value) => value + 1)), [])
  if (isStandalone()) return null
  if (canPromptInstall()) return 'prompt'
  if (isIos()) return 'ios'
  return null
}

function IosSteps({ onClose }) {
  return (
    <div className="sheet-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Adicionar o WebCond à tela de início">
        <div className="sheet-grip"><span /></div>
        <div className="sheet-body">
          <div className="sheet-head">
            <div style={{ flex: 1, fontSize: 19, fontWeight: 600 }}>Adicionar à tela de início</div>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            No iPhone e no iPad a Apple não deixa o site se instalar sozinho, mas leva só três toques:
          </div>
          <ol className="install-steps">
            <li><span className="install-step-icon"><Share size={18} /></span><span>Toque em <b>Compartilhar</b>, na barra do Safari (o quadrado com a seta para cima).</span></li>
            <li><span className="install-step-icon"><SquarePlus size={18} /></span><span>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</span></li>
            <li><span className="install-step-icon"><Smartphone size={18} /></span><span>Toque em <b>Adicionar</b>. O WebCond aparece na tela como um app.</span></li>
          </ol>
          <div className="list-sub" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Abriu pelo Chrome ou outro app? Abra este endereço no Safari para ver a opção.</div>
          <button type="button" className="btn btn-primary pay-big-btn" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

// Cartao "Instale o app" (Inicio do morador e painel do sindico). Some quando ja esta instalado,
// quando o navegador nao oferece instalacao, ou por 30 dias depois do "Agora nao".
export function InstallAppCard() {
  const mode = useInstallMode()
  const [hidden, setHidden] = useState(() => isInstallDismissed())
  const [showIos, setShowIos] = useState(false)

  if (!mode || hidden) return null

  const install = async () => {
    if (mode === 'ios') { setShowIos(true); return }
    const outcome = await promptInstall()
    if (outcome === 'accepted') setHidden(true)
  }

  return (
    <>
      <div className="install-card">
        <span className="install-card-icon"><img src="/brand/wc-simbolo-branco.svg" alt="" aria-hidden="true" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>Baixe o app do WebCond</strong>
          <span>Coloque o WebCond na tela inicial do celular (ou na área de trabalho) e abra como um aplicativo, em tela cheia.</span>
        </div>
        <div className="install-card-actions">
          <button type="button" className="install-cta" onClick={install}><Download size={20} />Baixar e adicionar à tela inicial</button>
          <button type="button" className="install-later" onClick={() => { dismissInstall(); setHidden(true) }}>Agora não</button>
        </div>
      </div>
      {showIos && <IosSteps onClose={() => setShowIos(false)} />}
    </>
  )
}

// Botao discreto (tela de login e menu "Meu perfil"). Mesmo comportamento, sem o "Agora nao".
export function InstallAppButton({ className = 'mini-btn', label = 'Instalar o app' }) {
  const mode = useInstallMode()
  const [showIos, setShowIos] = useState(false)
  if (!mode) return null
  return (
    <>
      <button type="button" className={className} onClick={() => (mode === 'ios' ? setShowIos(true) : void promptInstall())}>
        <Download size={15} />{label}
      </button>
      {showIos && <IosSteps onClose={() => setShowIos(false)} />}
    </>
  )
}
