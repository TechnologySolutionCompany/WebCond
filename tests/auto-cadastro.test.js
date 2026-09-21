// Auto-cadastro por link: regras puras do servidor (validacao dos dados e ciclo do convite).
// O fluxo com banco tem verificacao propria no roteiro de testes manuais do docs/.
import assert from 'node:assert/strict'
import test from 'node:test'
import { isCpfValid, isEmailValid, isWhatsappValid, normalizeCpfDigits, normalizeWhatsapp } from '../api/_lib/personValidation.js'
import { describeInvite, generateInviteToken, isInviteExpired } from '../api/_lib/signupLink.js'

test('CPF so passa com os dois digitos verificadores corretos', () => {
  assert.equal(isCpfValid('529.982.247-25'), true)
  assert.equal(isCpfValid('52998224725'), true)
  assert.equal(isCpfValid('529.982.247-26'), false)
  assert.equal(isCpfValid('111.111.111-11'), false)
  assert.equal(isCpfValid('5299822472'), false)
  assert.equal(isCpfValid('abc.def.ghi-jk'), false)
})

test('WhatsApp aceita mascara e +55, mas exige celular brasileiro com DDD real', () => {
  assert.equal(isWhatsappValid('(81) 99724-3724', normalizeWhatsapp('(81) 99724-3724')), true)
  assert.equal(isWhatsappValid('+55 81 99724-3724', normalizeWhatsapp('+55 81 99724-3724')), true)
  assert.equal(normalizeWhatsapp('+55 81 99724-3724'), '81997243724')
  // DDD inexistente
  assert.equal(isWhatsappValid('(00) 99724-3724', normalizeWhatsapp('(00) 99724-3724')), false)
  // Fixo (sem o 9)
  assert.equal(isWhatsappValid('(81) 3724-3724', normalizeWhatsapp('(81) 3724-3724')), false)
  // Numero de outro pais
  assert.equal(isWhatsappValid('+1 202 555 0134', normalizeWhatsapp('+1 202 555 0134')), false)
})

test('e-mail e opcional, mas quando vem precisa ter formato valido', () => {
  assert.equal(isEmailValid('morador@exemplo.com'), true)
  assert.equal(isEmailValid('morador@exemplo'), false)
  assert.equal(isEmailValid('dois@exemplo.com;outro@exemplo.com'), false)
  assert.equal(isEmailValid(`${'a'.repeat(250)}@exemplo.com`), false)
})

test('CPF e normalizado para so digitos', () => {
  assert.equal(normalizeCpfDigits(' 529.982.247-25 '), '52998224725')
  assert.equal(normalizeCpfDigits(null), '')
})

test('o token do link e aleatorio, curto e seguro para URL', () => {
  const tokens = new Set(Array.from({ length: 200 }, generateInviteToken))
  assert.equal(tokens.size, 200, 'houve token repetido')
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{32}$/)
  }
})

test('convite vencido e reconhecido pela data', () => {
  const ontem = new Date(Date.now() - 86400000).toISOString()
  const amanha = new Date(Date.now() + 86400000).toISOString()
  assert.equal(isInviteExpired({ expira_em: ontem }), true)
  assert.equal(isInviteExpired({ expira_em: amanha }), false)
  assert.equal(isInviteExpired(null), false)
})

test('a descricao do convite nao carrega o condominio nem quem criou', () => {
  const invite = {
    id: 'lote-1',
    token: 'abc123',
    condominium_id: 'condominio-secreto',
    created_by: 'perfil-do-sindico',
    expira_em: new Date(Date.now() + 86400000).toISOString(),
    usos: 3,
    created_at: '2026-09-24T12:00:00.000Z',
  }
  const described = describeInvite(invite)
  const serialized = JSON.stringify(described)

  assert.equal(described.token, 'abc123')
  assert.equal(described.usos, 3)
  assert.equal(described.expirado, false)
  assert.ok(!serialized.includes('condominio-secreto'))
  assert.ok(!serialized.includes('perfil-do-sindico'))
  assert.equal(describeInvite(null), null)
})
