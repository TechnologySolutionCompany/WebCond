// Disparo das notificacoes (push, e-mail, WhatsApp). Chamado depois que o aviso ja foi gravado:
// se um canal falhar, o aviso continua no app do morador normalmente.
// Nenhum segredo (chaves, tokens) sai daqui em resposta, log ou erro.
import webpush from 'web-push'
import { supabaseAdmin } from './supabaseAdmin.js'
import { getCondominiumAccessState } from '../../src/lib/condominiumPlan.js'
import {
  avisoTargetsPerson,
  buildEmailMessage,
  buildPersonMessage,
  buildPushPayload,
  buildWhatsAppParams,
  isRealEmail,
  NOTIFY_MAX_AGE_MS,
  planNotificationChannels,
  whatsappToE164,
} from '../../src/lib/notifications.js'

const PUSH_CONCURRENCY = 10
const EMAIL_BATCH = 100
const RESIDENT_ROLES = new Set(['morador', 'resident'])
const STAFF_ROLES = new Set(['platform_admin', 'suporte'])

// Quais canais estao configurados no servidor (so booleanos: usado tambem no Status da plataforma).
export function getChannelConfig(env = process.env) {
  return {
    push: Boolean(env.VITE_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    email: Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL_FROM),
    whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  }
}

function appUrl() {
  return process.env.APP_URL || 'https://webcond.vercel.app'
}

async function inBatches(items, size, worker) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker))
  }
}

// ---------------------------------------------------------------- push
async function sendPushToProfiles(messagesByProfile) {
  const summary = { aparelhos: 0, enviados: 0, falhas: 0 }
  const profileIds = [...messagesByProfile.keys()]
  if (!profileIds.length || !getChannelConfig().push) return summary

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_inscricoes')
    .select('id, profile_id, endpoint, p256dh, auth')
    .in('profile_id', profileIds)
  if (error || !subscriptions?.length) return summary

  const vapidDetails = {
    subject: process.env.VAPID_SUBJECT || appUrl(),
    publicKey: process.env.VITE_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  }
  const expired = []
  const delivered = []
  summary.aparelhos = subscriptions.length

  await inBatches(subscriptions, PUSH_CONCURRENCY, async (subscription) => {
    const payload = JSON.stringify(buildPushPayload(messagesByProfile.get(subscription.profile_id)))
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        { TTL: 24 * 60 * 60, urgency: 'normal', vapidDetails, timeout: 8000 },
      )
      summary.enviados += 1
      delivered.push(subscription.id)
    } catch (sendError) {
      summary.falhas += 1
      // 404/410: o navegador cancelou a inscricao (desinstalou, limpou dados). Sai da lista.
      if (sendError?.statusCode === 404 || sendError?.statusCode === 410) expired.push(subscription.id)
    }
  })

  if (expired.length) await supabaseAdmin.from('push_inscricoes').delete().in('id', expired)
  if (delivered.length) await supabaseAdmin.from('push_inscricoes').update({ ultimo_envio_em: new Date().toISOString() }).in('id', delivered)
  return summary
}

// ---------------------------------------------------------------- e-mail (Resend)
async function sendEmails(emails) {
  const summary = { enviados: 0, falhas: 0 }
  if (!emails.length) return summary

  for (let index = 0; index < emails.length; index += EMAIL_BATCH) {
    const batch = emails.slice(index, index + EMAIL_BATCH)
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((email) => ({ from: process.env.NOTIFY_EMAIL_FROM, ...email }))),
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) summary.enviados += batch.length
      else summary.falhas += batch.length
    } catch {
      summary.falhas += batch.length
    }
  }
  return summary
}

// ---------------------------------------------------------------- WhatsApp (Meta Cloud API)
async function sendWhatsApps(messages) {
  const summary = { enviados: 0, falhas: 0 }
  if (!messages.length) return summary

  const version = process.env.WHATSAPP_API_VERSION || 'v23.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  const template = process.env.WHATSAPP_TEMPLATE || 'webcond_notificacao'
  const language = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR'

  await inBatches(messages, 5, async (message) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [{ type: 'body', parameters: message.params.map((text) => ({ type: 'text', text })) }],
          },
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) summary.enviados += 1
      else summary.falhas += 1
    } catch {
      summary.falhas += 1
    }
  })
  return summary
}

// ---------------------------------------------------------------- moradores
async function loadResidents(condominiumId) {
  const { data: people, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, email, whatsapp, apartamento, role, ativo, notificar_email, notificar_whatsapp')
    .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    .eq('ativo', true)
  if (error) throw error

  const residents = (people || []).filter((person) => RESIDENT_ROLES.has(String(person.role || '').trim().toLowerCase()))
  if (!residents.length) return []

  const { data: links } = await supabaseAdmin
    .from('unidade_vinculos')
    .select('profile_id, unidades(numero)')
    .in('profile_id', residents.map((person) => person.id))

  const unitsByPerson = new Map()
  for (const link of links || []) {
    if (!link.unidades?.numero) continue
    if (!unitsByPerson.has(link.profile_id)) unitsByPerson.set(link.profile_id, [])
    unitsByPerson.get(link.profile_id).push(link.unidades.numero)
  }

  return residents.map((person) => ({ ...person, unit_numbers: unitsByPerson.get(person.id) || [] }))
}

async function deliver(recipients, allowedChannels) {
  const config = getChannelConfig()
  const channels = {
    push: config.push && allowedChannels.includes('push'),
    email: config.email && allowedChannels.includes('email'),
    whatsapp: config.whatsapp && allowedChannels.includes('whatsapp'),
  }

  const messagesByProfile = new Map(recipients.map(({ person, message }) => [person.id, message]))
  const emails = channels.email
    ? recipients
      .filter(({ person }) => person.notificar_email !== false && isRealEmail(person.email))
      .map(({ person, message }) => ({ to: [person.email], ...buildEmailMessage(message, { personName: person.nome, appUrl: appUrl() }) }))
    : []
  const whatsapps = channels.whatsapp
    ? recipients
      .filter(({ person }) => person.notificar_whatsapp === true && whatsappToE164(person.whatsapp))
      .map(({ person, message }) => ({ to: whatsappToE164(person.whatsapp), params: buildWhatsAppParams(message, person.nome) }))
    : []

  const [push, email, whatsapp] = await Promise.all([
    channels.push ? sendPushToProfiles(messagesByProfile) : { aparelhos: 0, enviados: 0, falhas: 0 },
    sendEmails(emails),
    sendWhatsApps(whatsapps),
  ])

  return {
    canais: channels,
    push,
    email: { ...email, ativo: channels.email },
    whatsapp: { ...whatsapp, ativo: channels.whatsapp },
  }
}

// Avisos (e cobrancas, que viram avisos por unidade) publicados pelo sindico.
// Cada aviso e "reservado" com notificado_em antes do envio: pedir de novo nao duplica.
export async function dispatchAvisos({ condominiumId, ids }) {
  const since = new Date(Date.now() - NOTIFY_MAX_AGE_MS).toISOString()
  const { data: avisos, error } = await supabaseAdmin
    .from('avisos')
    .update({ notificado_em: new Date().toISOString() })
    .in('id', ids)
    .eq('condominium_id', condominiumId)
    .eq('ativo', true)
    .is('notificado_em', null)
    .gte('created_at', since)
    .select('id, titulo, conteudo, destinatario, apartamento_destino, created_at')
  if (error) throw error
  if (!avisos?.length) return { avisos: 0, pessoas: 0 }

  const { data: condominium } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, status, metadata, created_at, updated_at')
    .eq('id', condominiumId)
    .maybeSingle()
  const planName = condominium ? getCondominiumAccessState(condominium).planName : null
  const condoName = condominium?.name || condominium?.nome || ''

  const residents = await loadResidents(condominiumId)
  const recipients = residents
    .map((person) => ({ person, avisos: avisos.filter((aviso) => avisoTargetsPerson(aviso, person)) }))
    .filter((entry) => entry.avisos.length)
    .map(({ person, avisos: personAvisos }) => ({ person, message: buildPersonMessage(personAvisos, condoName) }))

  const result = await deliver(recipients, planNotificationChannels(planName))
  return { avisos: avisos.length, pessoas: recipients.length, ...result }
}

// Chamado de suporte aberto pelo sindico: avisa no aparelho quem atende (admin e equipe de suporte).
export async function dispatchSupportTicket({ condominiumId, ticketId }) {
  const { data: ticket, error } = await supabaseAdmin
    .from('suporte_chamados')
    .update({ notificado_em: new Date().toISOString() })
    .eq('id', ticketId)
    .eq('condominium_id', condominiumId)
    .is('notificado_em', null)
    .gte('created_at', new Date(Date.now() - NOTIFY_MAX_AGE_MS).toISOString())
    .select('id, assunto, mensagem')
    .maybeSingle()
  if (error) throw error
  if (!ticket) return { pessoas: 0 }

  const [{ data: condominium }, { data: staff }] = await Promise.all([
    supabaseAdmin.from('condominiums').select('name, nome').eq('id', condominiumId).maybeSingle(),
    supabaseAdmin.from('profiles').select('id, role, ativo').eq('ativo', true).in('role', ['platform_admin', 'PLATFORM_ADMIN', 'suporte']),
  ])
  const team = (staff || []).filter((person) => STAFF_ROLES.has(String(person.role || '').trim().toLowerCase()))
  const message = {
    condo: 'Suporte WebCond',
    title: `Novo chamado: ${condominium?.name || condominium?.nome || 'condominio'}`.slice(0, 60),
    body: String(ticket.assunto || ticket.mensagem || '').replace(/\s+/g, ' ').slice(0, 160),
    url: '/platform?pagina=suporte',
    tag: `suporte-${ticket.id}`,
  }
  const push = await sendPushToProfiles(new Map(team.map((person) => [person.id, message])))
  return { pessoas: team.length, push }
}
