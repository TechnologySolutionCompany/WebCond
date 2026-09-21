// Caixa de notificacoes do sindico: o que entra e o que fica de fora.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentConfirmationTitle,
  filterSyndicNotifications,
} from '../src/lib/residentRequests.js'

const SINDICO = 'perfil-do-sindico'
const MORADOR = 'perfil-do-morador'

function confirmacao(chargeId, extra = {}) {
  return {
    id: `oc-${chargeId}`,
    titulo: buildPaymentConfirmationTitle(chargeId),
    created_by: MORADOR,
    status: 'em_analise',
    ...extra,
  }
}

test('confirmacao de pagamento de cobranca excluida nao aparece mais', () => {
  const itens = [confirmacao('cobranca-viva'), confirmacao('cobranca-excluida')]
  const visiveis = filterSyndicNotifications(itens, { chargeIds: new Set(['cobranca-viva']) })

  assert.equal(visiveis.length, 1)
  assert.equal(visiveis[0].titulo, buildPaymentConfirmationTitle('cobranca-viva'))
})

test('o que o proprio sindico criou nao volta para ele', () => {
  const itens = [
    { id: 'a', titulo: 'Aviso de manutencao', created_by: SINDICO, status: 'aberto' },
    { id: 'b', titulo: 'Vazamento na garagem', created_by: MORADOR, status: 'aberto' },
  ]
  const visiveis = filterSyndicNotifications(itens, { viewerId: SINDICO })

  assert.deepEqual(visiveis.map((item) => item.id), ['b'])
})

test('o que ja foi resolvido sai da caixa', () => {
  const itens = [
    confirmacao('c1', { status: 'resolvido' }),
    confirmacao('c2', { status: 'em_analise' }),
  ]
  const visiveis = filterSyndicNotifications(itens, { chargeIds: new Set(['c1', 'c2']) })

  assert.deepEqual(visiveis.map((item) => item.id), ['oc-c2'])
})

test('sem a lista de cobrancas, nada e descartado por cobranca inexistente', () => {
  const itens = [confirmacao('qualquer')]
  assert.equal(filterSyndicNotifications(itens).length, 1)
  assert.equal(filterSyndicNotifications(itens, { chargeIds: null }).length, 1)
})

test('ocorrencia comum do morador continua chegando', () => {
  const itens = [{ id: 'x', titulo: 'Portao com defeito', created_by: MORADOR, status: 'aberto' }]
  const visiveis = filterSyndicNotifications(itens, { chargeIds: new Set(), viewerId: SINDICO })

  assert.deepEqual(visiveis.map((item) => item.id), ['x'])
})
