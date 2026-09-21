// Catalogo de planos: precos, limites e o que pode (ou nao) aparecer para o sindico.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PLANS, PUBLIC_PLAN_LIST, TRIAL_PERIOD_DAYS } from '../src/lib/condominiumPlan.js'

test('precos e limites de documentos sao os combinados', () => {
  assert.equal(PLANS.ONE.priceLabel, 'R$ 59,90')
  assert.equal(PLANS.PRO.priceLabel, 'R$ 79,90')
  assert.equal(PLANS.MAX.priceLabel, 'R$ 99,90')
  assert.equal(PLANS.ONE.documentLimit, 10)
  assert.equal(PLANS.PRO.documentLimit, 20)
  assert.equal(PLANS.MAX.documentLimit, 50)
  assert.equal(TRIAL_PERIOD_DAYS, 30)
})

test('o plano Parceria nunca aparece na vitrine do sindico', () => {
  const ids = PUBLIC_PLAN_LIST.map((plan) => plan.id)
  assert.deepEqual(ids, ['ONE', 'PRO', 'MAX'])
  assert.equal(PLANS.PARCERIA.publicPlan, false)
  assert.ok(!JSON.stringify(PUBLIC_PLAN_LIST).toLowerCase().includes('parceria'))
})

test('todo plano da vitrine tem resumo e itens; o que nao existe ainda vem marcado', () => {
  for (const plan of PUBLIC_PLAN_LIST) {
    assert.ok(plan.summary, `plano ${plan.id} sem resumo`)
    assert.ok(plan.features.length > 0, `plano ${plan.id} sem itens`)
    for (const feature of plan.features) assert.ok(feature.text, `item vazio no plano ${plan.id}`)
  }

  // PRO e MAX ainda nao estao disponiveis: nao podem ser contratados.
  assert.equal(PLANS.ONE.available, true)
  assert.equal(PLANS.PRO.available, false)
  assert.equal(PLANS.MAX.available, false)

  // O que o ONE entrega hoje precisa estar sem marca de "em breve".
  const prontos = PLANS.ONE.features.filter((feature) => !feature.soon)
  assert.ok(prontos.length >= 3, 'o plano ONE precisa listar o que ja funciona hoje')
})
