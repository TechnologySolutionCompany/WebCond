// Notificacoes enviadas quando o sindico publica um aviso ou lanca uma cobranca (toda cobranca ja
// gera um aviso por unidade). Tres canais:
//   push      -> notificacao no celular/computador onde a pessoa entrou e aceitou receber (gratis)
//   email     -> e-mail cadastrado da pessoa (provedor Resend; liga com RESEND_API_KEY)
//   whatsapp  -> WhatsApp oficial da Meta (Cloud API; liga com WHATSAPP_TOKEN). So para quem autorizou.
// Funcoes puras: usadas pelo backend (api/_lib/notify.js), pela tela e pelos testes.
import { getPlan } from './condominiumPlan.js'

export const NOTIFY_CHANNELS = {
  push: { label: 'Celular e computador', short: 'aparelho' },
  email: { label: 'E-mail', short: 'e-mail' },
  whatsapp: { label: 'WhatsApp', short: 'WhatsApp' },
}

// Aviso mais antigo que isso nao dispara notificacao (evita reenviar comunicados velhos).
export const NOTIFY_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const NOTIFY_MAX_IDS = 500

const INTERNAL_EMAIL = /@login\.webcond\.local$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isRealEmail(email) {
  const value = String(email || '').trim()
  return EMAIL.test(value) && !INTERNAL_EMAIL.test(value)
}

// WhatsApp no formato internacional sem simbolos (55 + DDD + numero), como a Meta exige.
export function whatsappToE164(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits
  return ''
}

// Canais que o plano do condominio libera. WhatsApp custa por mensagem: fica nos planos maiores.
export function planNotificationChannels(planName) {
  const plan = getPlan(planName)
  return plan.notificationChannels || ['push', 'email']
}

function normalizeUnit(value) {
  return String(value || '').trim().toUpperCase()
}

// Mesma regra do RLS avisos_read_targeted: quem ve o aviso no app e quem recebe a notificacao.
export function avisoTargetsPerson(aviso, person) {
  if (!aviso || !person) return false
  if (aviso.destinatario === 'todos') return true
  if (aviso.destinatario !== 'apartamento') return false

  const target = normalizeUnit(aviso.apartamento_destino)
  if (!target) return false

  const units = [person.apartamento, ...(person.unit_numbers || [])].map(normalizeUnit).filter(Boolean)
  return units.includes(target)
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function isChargeNotice(aviso) {
  return /cobranca/i.test(String(aviso?.titulo || ''))
}

// Uma mensagem por pessoa: quem recebe varios avisos de uma vez (proprietario com 3 unidades
// recebendo a cobranca do mes) ganha uma notificacao so, com o resumo.
export function buildPersonMessage(avisos, condominiumName = '') {
  const list = (avisos || []).filter(Boolean)
  const condo = String(condominiumName || '').trim() || 'Seu condominio'
  const allCharges = list.length > 0 && list.every(isChargeNotice)

  if (list.length === 1) {
    const [aviso] = list
    return {
      title: truncate(aviso.titulo || 'Novo aviso', 60),
      body: truncate(aviso.conteudo || '', 180),
      condo,
      url: allCharges ? '/morador?pagina=cobrancas' : '/morador?pagina=avisos',
      tag: `aviso-${aviso.id}`,
    }
  }

  return {
    title: allCharges ? `${list.length} novas cobrancas` : `${list.length} novos avisos`,
    body: truncate(list.map((aviso) => aviso.titulo).join(' · '), 180),
    condo,
    url: allCharges ? '/morador?pagina=cobrancas' : '/morador?pagina=avisos',
    tag: `avisos-${list[0].id}`,
  }
}

export function buildPushPayload(message) {
  return {
    title: `${message.condo}: ${message.title}`.slice(0, 90),
    body: message.body,
    url: message.url,
    tag: message.tag,
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

export function buildEmailMessage(message, { personName = '', appUrl = '' } = {}) {
  const firstName = String(personName || '').trim().split(/\s+/)[0] || ''
  const link = `${String(appUrl || '').replace(/\/+$/, '')}${message.url}`
  const greeting = firstName ? `Ola, ${firstName}!` : 'Ola!'
  const text = [
    greeting,
    '',
    `${message.condo} publicou: ${message.title}`,
    message.body,
    '',
    `Abra o WebCond para ver os detalhes: ${link}`,
    '',
    'Voce recebe este e-mail porque mora ou tem unidade neste condominio. Para parar, desligue "E-mail" em Meu perfil > Notificacoes.',
  ].join('\n')

  // Logo em PNG de proposito: quase nenhum aplicativo de e-mail abre SVG.
  // Se o aplicativo bloquear imagem, fica o texto "WebCond" no lugar e o e-mail continua legivel.
  const logo = `${String(appUrl || '').replace(/\/+$/, '')}/logo-email.png`
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2328;max-width:520px">
<p style="margin:0 0 18px"><img src="${escapeHtml(logo)}" alt="WebCond" width="150" style="display:block;border:0;height:auto;width:150px" /></p>
<p>${escapeHtml(greeting)}</p>
<p><strong>${escapeHtml(message.condo)}</strong> publicou:</p>
<p style="font-size:16px;font-weight:bold;margin:0 0 6px">${escapeHtml(message.title)}</p>
<p style="margin:0 0 18px;color:#57606a">${escapeHtml(message.body)}</p>
<p><a href="${escapeHtml(link)}" style="background:#2160C4;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir o WebCond</a></p>
<p style="font-size:11px;color:#8c959f;margin-top:24px">Voce recebe este e-mail porque mora ou tem unidade neste condominio. Para parar, desligue "E-mail" em Meu perfil &gt; Notificacoes.</p>
</div>`

  return { subject: `${message.condo}: ${message.title}`.slice(0, 120), text, html }
}

// Parametros do modelo aprovado na Meta. A Meta recusa quebra de linha, tab e 4+ espacos seguidos.
export function sanitizeTemplateParam(value, max = 120) {
  return truncate(String(value || '').replace(/[\n\r\t]+/g, ' ').replace(/ {4,}/g, ' '), max) || '-'
}

// Modelo "webcond_notificacao": Ola, {{1}}! O condominio {{2}} publicou: {{3}}. Abra o WebCond para ver os detalhes.
export function buildWhatsAppParams(message, personName = '') {
  const firstName = String(personName || '').trim().split(/\s+/)[0] || 'morador'
  return [
    sanitizeTemplateParam(firstName, 40),
    sanitizeTemplateParam(message.condo, 60),
    sanitizeTemplateParam(message.title, 90),
  ]
}

// Endpoints aceitos para push: so os servicos oficiais dos navegadores. Impede que alguem
// cadastre uma URL qualquer e faca o servidor chamar enderecos arbitrarios.
const PUSH_HOST_SUFFIXES = ['.googleapis.com', '.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com']
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']

export function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint || ''))
    if (url.protocol !== 'https:' || String(endpoint).length > 1000) return false
    const host = url.hostname.toLowerCase()
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  } catch {
    return false
  }
}

// Resumo curto para o sindico depois de publicar: "Enviado para 12 aparelhos e 8 e-mails."
export function describeNotifyResult(result) {
  if (!result || !result.pessoas) return ''
  const parts = []
  if (result.push?.enviados) parts.push(`${result.push.enviados} ${result.push.enviados === 1 ? 'aparelho' : 'aparelhos'}`)
  if (result.email?.enviados) parts.push(`${result.email.enviados} ${result.email.enviados === 1 ? 'e-mail' : 'e-mails'}`)
  if (result.whatsapp?.enviados) parts.push(`${result.whatsapp.enviados} WhatsApp`)
  if (!parts.length) return 'Nenhum morador desta publicacao ativou notificacoes ainda. Eles veem o aviso ao abrir o app.'
  const last = parts.pop()
  return `Notificacao enviada para ${parts.length ? `${parts.join(', ')} e ${last}` : last}.`
}
