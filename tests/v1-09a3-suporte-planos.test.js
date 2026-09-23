// Conversa do suporte, logo do condominio e a nova tela de planos (v1.09A3, segunda parte).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PLANS, planAllowsCustomLogo, PUBLIC_PLAN_LIST } from '../src/lib/condominiumPlan.js'
import { MSG_PLANOS, whatsappPlanoUrl, whatsappUrl } from '../src/lib/contato.js'

// Quebra de linha do Windows nao muda o conteudo: normaliza antes de comparar.
const sql = readFileSync(new URL('../sql/2026-09-27_suporte_chat_logo_condominio.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('logo no boleto: so nos planos que preveem personalizacao', () => {
  assert.equal(planAllowsCustomLogo('MAX'), true)
  assert.equal(planAllowsCustomLogo('PARCERIA'), true)
  assert.equal(planAllowsCustomLogo('ONE'), false)
  assert.equal(planAllowsCustomLogo('PRO'), false)
  assert.equal(planAllowsCustomLogo(''), false, 'sem plano definido cai no ONE')
})

test('planos: precos novos, nivel e descricao completa para a tela de contratacao', () => {
  assert.deepEqual(PUBLIC_PLAN_LIST.map((plan) => plan.priceLabel), ['R$ 49,90', 'R$ 65,90', 'R$ 89,90'])
  assert.deepEqual(PUBLIC_PLAN_LIST.map((plan) => plan.nivel), ['Basico', 'Intermediario', 'Avancado'])
  assert.match(PLANS.MAX.description, /boleto/i)
  assert.match(PLANS.PRO.description, /Pix|WhatsApp/i)
  // O que ainda nao existe continua marcado, para a tela nao prometer o que nao entrega.
  assert.ok(PLANS.MAX.features.some((feature) => feature.soon))
})

test('WhatsApp da TSCBr ja abre com a mensagem pronta', () => {
  assert.match(whatsappUrl(), /^https:\/\/wa\.me\/5581997243724\?text=/)
  assert.ok(whatsappUrl(MSG_PLANOS).includes(encodeURIComponent('duvidas sobre os planos')))
  const link = whatsappPlanoUrl('MAX', 'Residencial Sol')
  assert.ok(link.includes(encodeURIComponent('plano MAX')))
  assert.ok(link.includes(encodeURIComponent('Residencial Sol')))
  assert.ok(!whatsappPlanoUrl('MAX').includes('undefined'))
})

test('SQL 09-27: conversa isolada por condominio e logo so pela plataforma', () => {
  // O sindico so le e escreve na conversa de chamado do proprio condominio, sempre como sindico.
  assert.match(sql, /create policy suporte_msg_sindico_select/)
  assert.match(sql, /autor_tipo = 'sindico'\n {4}and autor_id = auth\.uid\(\)/)
  assert.match(sql, /c\.condominium_id = public\.current_user_condominium_id\(\)/)
  // Equipe de suporte nao tem politica propria: responde pelas rotas /api/platform.
  assert.doesNotMatch(sql, /is_platform_support|role = 'suporte'/)
  // Chamado novo ja nasce com a primeira mensagem e volta para a fila quando o sindico escreve.
  assert.match(sql, /create trigger suporte_chamados_primeira_mensagem/)
  assert.match(sql, /when new\.autor_tipo = 'sindico' and status = 'resolvido' then 'aberto'/)
  // Conta da plataforma (admin e suporte) nunca fica presa a um condominio.
  assert.match(sql, /create trigger profiles_zz_plataforma_sem_condominio/)
  assert.match(sql, /in \('PLATFORM_ADMIN', 'SUPORTE'\)[\s\S]{0,120}new\.condominium_id := null/)
  assert.match(sql, /update public\.profiles\nset condominium_id = null/)
  // Logo: bucket de leitura publica, gravacao so do admin da plataforma.
  assert.match(sql, /values \('condominios', 'condominios', true, 2097152/)
  assert.match(sql, /create policy storage_condominios_insert[\s\S]{0,200}is_platform_admin\(\)/)
  assert.match(sql, /create policy storage_condominios_delete[\s\S]{0,200}is_platform_admin\(\)/)
})
