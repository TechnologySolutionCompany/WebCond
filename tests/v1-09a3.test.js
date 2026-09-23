// Regras novas da v1.09A3: notificacoes (quem recebe, o que vai na mensagem, canais por plano),
// equipe de suporte com acesso limitado e a migracao SQL da versao.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { APP_VERSION } from '../src/lib/appVersion.js'
import { getHomePathForRole, getUserRoleLabel, isSupportRole, normalizeRole } from '../src/lib/auth.js'
import {
  avisoTargetsPerson,
  buildEmailMessage,
  buildPersonMessage,
  buildPushPayload,
  buildWhatsAppParams,
  describeNotifyResult,
  isAllowedPushEndpoint,
  isRealEmail,
  planNotificationChannels,
  sanitizeTemplateParam,
  whatsappToE164,
} from '../src/lib/notifications.js'
import { isPlatformStaffProfile } from '../api/_lib/supabaseAdmin.js'
import { getChannelConfig } from '../api/_lib/notify.js'

const CONDO = '11111111-1111-1111-1111-111111111111'

test('versao v1.09A4', () => {
  assert.equal(APP_VERSION, 'v1.09A4')
})

test('notificacao vai para quem ve o aviso no app (mesma regra do RLS)', () => {
  const todos = { destinatario: 'todos' }
  const unidade = { destinatario: 'apartamento', apartamento_destino: ' 101a ' }
  assert.equal(avisoTargetsPerson(todos, { apartamento: '' }), true)
  assert.equal(avisoTargetsPerson(unidade, { apartamento: '101A' }), true, 'maiusculas e espacos nao importam')
  assert.equal(avisoTargetsPerson(unidade, { apartamento: '', unit_numbers: ['202', '101A'] }), true, 'proprietario com varias unidades')
  assert.equal(avisoTargetsPerson(unidade, { apartamento: '102', unit_numbers: ['202'] }), false)
  assert.equal(avisoTargetsPerson({ destinatario: 'apartamento', apartamento_destino: '' }, { apartamento: '' }), false)
  assert.equal(avisoTargetsPerson({ destinatario: 'outro' }, { apartamento: '101' }), false)
})

test('uma mensagem por pessoa: varias cobrancas viram um resumo', () => {
  const one = buildPersonMessage([{ id: 'a', titulo: 'Nova cobranca disponivel', conteudo: 'Unidade 101 (Setembro/2026).' }], 'Residencial Sol')
  assert.equal(one.url, '/morador?pagina=cobrancas')
  assert.equal(one.title, 'Nova cobranca disponivel')

  const many = buildPersonMessage([
    { id: 'a', titulo: 'Nova cobranca disponivel', conteudo: '' },
    { id: 'b', titulo: 'Nova cobranca disponivel', conteudo: '' },
    { id: 'c', titulo: 'Cobranca atualizada', conteudo: '' },
  ], 'Residencial Sol')
  assert.equal(many.title, '3 novas cobrancas')
  assert.equal(many.url, '/morador?pagina=cobrancas')

  const mixed = buildPersonMessage([{ id: 'a', titulo: 'Falta de agua', conteudo: '' }, { id: 'b', titulo: 'Nova cobranca disponivel', conteudo: '' }], '')
  assert.equal(mixed.title, '2 novos avisos')
  assert.equal(mixed.url, '/morador?pagina=avisos')
  assert.equal(mixed.condo, 'Seu condominio')

  const push = buildPushPayload(one)
  assert.match(push.title, /^Residencial Sol: /)
  assert.ok(buildPersonMessage([{ id: 'x', titulo: 'T', conteudo: 'x'.repeat(500) }]).body.length <= 180)
})

test('e-mail escapa HTML do aviso e respeita o descadastro', () => {
  const email = buildEmailMessage({ condo: 'Condo', title: '<script>alert(1)</script>', body: 'a & b', url: '/morador?pagina=avisos' }, { personName: 'Ana Souza', appUrl: 'https://webcond.vercel.app/' })
  assert.ok(!email.html.includes('<script>'))
  assert.ok(email.html.includes('&lt;script&gt;'))
  assert.ok(email.html.includes('a &amp; b'))
  assert.ok(email.text.includes('https://webcond.vercel.app/morador?pagina=avisos'))
  assert.match(email.text, /^Ola, Ana!/)
  assert.match(email.text, /Meu perfil > Notificacoes/)
})

test('WhatsApp: numero internacional e parametros aceitos pela Meta', () => {
  assert.equal(whatsappToE164('(81) 99999-8888'), '5581999998888')
  assert.equal(whatsappToE164('5581999998888'), '5581999998888')
  assert.equal(whatsappToE164('8133334444'), '558133334444')
  assert.equal(whatsappToE164('999'), '')
  assert.equal(sanitizeTemplateParam('linha 1\nlinha 2\t     fim'), 'linha 1 linha 2 fim')
  assert.equal(sanitizeTemplateParam(''), '-')
  assert.deepEqual(buildWhatsAppParams({ condo: 'Residencial Sol', title: 'Nova cobranca' }, 'Maria da Silva'), ['Maria', 'Residencial Sol', 'Nova cobranca'])
})

test('e-mail interno de login nunca recebe notificacao', () => {
  assert.equal(isRealEmail('ana@gmail.com'), true)
  assert.equal(isRealEmail('morador-123@login.webcond.local'), false)
  assert.equal(isRealEmail('sem-arroba'), false)
})

test('push so aceita os servicos oficiais dos navegadores', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true)
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true)
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/QAbc'), true)
  assert.equal(isAllowedPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=abc'), true)
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false, 'sem https')
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x'), false)
  assert.equal(isAllowedPushEndpoint('https://evil.com/?fcm.googleapis.com'), false)
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1/x'), false)
  assert.equal(isAllowedPushEndpoint('nao e url'), false)
  assert.equal(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(1100)}`), false)
})

test('canais por plano: WhatsApp so nos planos maiores', () => {
  assert.deepEqual(planNotificationChannels('ONE'), ['push', 'email'])
  assert.ok(planNotificationChannels('PRO').includes('whatsapp'))
  assert.ok(planNotificationChannels('MAX').includes('whatsapp'))
  assert.ok(planNotificationChannels('PARCERIA').includes('whatsapp'))
  assert.deepEqual(planNotificationChannels('FREE'), ['push', 'email'], 'nome antigo cai no ONE')
})

test('canais ligados so com as variaveis do servidor', () => {
  assert.deepEqual(getChannelConfig({}), { push: false, email: false, whatsapp: false })
  assert.deepEqual(getChannelConfig({ VITE_VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', RESEND_API_KEY: 'c' }), { push: true, email: false, whatsapp: false })
})

test('resumo para o sindico depois de publicar', () => {
  assert.equal(describeNotifyResult(null), '')
  assert.equal(describeNotifyResult({ pessoas: 0 }), '')
  assert.match(describeNotifyResult({ pessoas: 3, push: { enviados: 0 } }), /Nenhum morador/)
  assert.equal(describeNotifyResult({ pessoas: 3, push: { enviados: 2 }, email: { enviados: 1 } }), 'Notificacao enviada para 2 aparelhos e 1 e-mail.')
})

test('equipe de suporte: papel proprio, sem condominio, vai para o painel da plataforma', () => {
  assert.equal(normalizeRole('SUPORTE'), 'suporte')
  assert.equal(isSupportRole('suporte'), true)
  assert.equal(getHomePathForRole('suporte'), '/platform')
  assert.equal(getUserRoleLabel('suporte'), 'Suporte da plataforma')

  assert.equal(isPlatformStaffProfile({ role: 'PLATFORM_ADMIN' }), true)
  assert.equal(isPlatformStaffProfile({ role: 'suporte', condominium_id: null }), true)
  assert.equal(isPlatformStaffProfile({ role: 'suporte', condominium_id: CONDO }), false, 'suporte ligado a condominio e invalido')
  assert.equal(isPlatformStaffProfile({ role: 'suporte', condominio_id: CONDO }), false)
  assert.equal(isPlatformStaffProfile({ role: 'admin', condominium_id: CONDO }), false)
  assert.equal(isPlatformStaffProfile({ role: 'morador' }), false)
})

test('SQL da versao: exclusao real, papel suporte protegido e push so pelo backend', () => {
  const sql = readFileSync(new URL('../sql/2026-09-26_avisos_equipe_notificacoes.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.match(sql, /delete from public\.avisos where ativo = false/)
  assert.match(sql, /'platform_admin', 'suporte'/)
  assert.match(sql, /privileged constant text\[\] := array\['ADMIN', 'ADMIN_CONDOMINIUM', 'PLATFORM_ADMIN', 'SUPORTE'\]/)
  assert.match(sql, /notificar_whatsapp boolean not null default false/, 'WhatsApp so com autorizacao')
  assert.match(sql, /create policy push_inscricoes_select_own/)
  assert.doesNotMatch(sql, /on public\.push_inscricoes for (insert|update|delete|all)/, 'escrita so pelo backend')
})
