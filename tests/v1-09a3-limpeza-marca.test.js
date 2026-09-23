// Limpeza do banco, marca nova e o espaco reservado para o Plano Pro (v1.09A3, terceira parte).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PLANS,
  PLAN_RESOURCES,
  RECURSOS,
  RECURSOS_ENTREGUES,
  planAllowsCustomLogo,
  planHasResource,
  planPromisesResource,
} from '../src/lib/condominiumPlan.js'
import {
  buildAssinaturaMetadata,
  buildCheckoutUrl,
  getAssinaturaConfig,
  readAssinatura,
  statusDoEvento,
} from '../src/lib/assinatura.js'
import { buildEmailMessage } from '../src/lib/notifications.js'

const arquivo = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8')
const sql = arquivo('sql/2026-09-28_limpeza_seguranca_e_plano_pro.sql')

test('SQL 09-28: fecha a view que entregava os condominios sem login', () => {
  assert.match(sql, /drop view if exists public\.condominios;/)
  assert.match(sql, /drop table if exists public\.webcond;/)
  // A regra antiga so espelha as duas colunas: nao escolhe condominio para ninguem.
  assert.match(sql, /create or replace function public\.sync_legacy_condominium_id/)
  assert.doesNotMatch(sql.split('-- 4.')[0], /default_condominium_id\(\)\s*;?\s*$/m)
  assert.match(sql, /drop function if exists public\.default_condominium_id\(\)/)
})

test('SQL 09-28: arquivo com limite de tamanho e sem tipo que executa script', () => {
  assert.match(sql, /file_size_limit = 20971520/)
  assert.match(sql, /file_size_limit = 10485760/)
  const listasDeTipos = sql.match(/allowed_mime_types = array\[[\s\S]*?\]/g) || []
  assert.ok(listasDeTipos.length >= 2, 'os dois buckets precisam de lista de tipos')
  for (const lista of listasDeTipos) {
    assert.doesNotMatch(lista, /html|svg/i, 'html e svg executam script quando abertos pelo link')
  }
})

test('SQL 09-28: limpeza so alcanca o que nao tem mais uso', () => {
  // Registro que perdeu o condominio nao aparece para ninguem.
  assert.match(sql, /delete from public\.avisos where condominium_id is null and condominio_id is null/)
  // Chamado de suporte e historico: nao entra na limpeza.
  assert.doesNotMatch(sql, /delete from public\.suporte_chamados/)
  assert.doesNotMatch(sql, /delete from public\.suporte_mensagens/)
  // Condominio, unidade e perfil jamais sao apagados por rotina.
  assert.doesNotMatch(sql, /delete from public\.condominiums/)
  assert.doesNotMatch(sql, /delete from public\.unidades/)
  assert.doesNotMatch(sql, /delete from public\.profiles/)
})

test('SQL 09-28: espaco da assinatura fica trancado para sindico e morador', () => {
  assert.match(sql, /create table if not exists public\.assinatura_eventos/)
  assert.match(sql, /alter table public\.assinatura_eventos enable row level security/)
  assert.match(sql, /revoke all on table public\.assinatura_eventos from anon, authenticated/)
  // RLS ligada e nenhuma policy: so o backend alcanca.
  assert.doesNotMatch(sql, /create policy .* on public\.assinatura_eventos/)
  // Webhook repetido nao pode ser processado duas vezes.
  assert.match(sql, /assinatura_eventos_idempotencia_idx/)
})

test('recursos: o plano da direito e o sistema entrega, sao duas perguntas diferentes', () => {
  assert.equal(planPromisesResource('PRO', 'pixAutomatico'), true, 'o PRO promete o Pix automatico')
  assert.equal(planHasResource('PRO', 'pixAutomatico'), false, 'mas ele ainda nao existe (v1.10)')
  assert.equal(planHasResource('MAX', 'logoNoBoleto'), true)
  assert.equal(planHasResource('ONE', 'logoNoBoleto'), false)
  // Toda chave usada nos planos precisa estar descrita, e vice-versa.
  const usadas = new Set(Object.values(PLAN_RESOURCES).flat())
  for (const chave of usadas) assert.ok(RECURSOS[chave], `recurso sem descricao: ${chave}`)
  for (const chave of Object.keys(RECURSOS)) assert.ok(usadas.has(chave), `recurso descrito e nao usado: ${chave}`)
  for (const chave of RECURSOS_ENTREGUES) assert.ok(RECURSOS[chave], `entregue sem descricao: ${chave}`)
})

test('recursos: a logo do boleto tem uma fonte de verdade so', () => {
  for (const plano of Object.values(PLANS)) {
    assert.equal(planAllowsCustomLogo(plano.id), Boolean(plano.customLogo), `divergencia no plano ${plano.id}`)
  }
})

test('assinatura: sem provedor configurado, contratar continua pelo WhatsApp', () => {
  const config = getAssinaturaConfig({})
  assert.equal(config.ativo, false)
  assert.equal(config.provedor, 'nenhum')
  assert.equal(buildCheckoutUrl({ plano: 'PRO' }, {}), null)
  // Provedor sem endereco, ou endereco sem https, nao liga nada.
  assert.equal(buildCheckoutUrl({ plano: 'PRO' }, { VITE_ASSINATURA_PROVEDOR: 'asaas' }), null)
  assert.equal(buildCheckoutUrl({ plano: 'PRO' }, { VITE_ASSINATURA_PROVEDOR: 'asaas', VITE_ASSINATURA_CHECKOUT_URL: 'http://inseguro.test' }), null)
})

test('assinatura: com provedor, o checkout leva plano, valor e condominio', () => {
  const env = { VITE_ASSINATURA_PROVEDOR: 'mercadopago', VITE_ASSINATURA_CHECKOUT_URL: 'https://pagamento.test/assinar' }
  const url = new URL(buildCheckoutUrl({ plano: 'PRO', condominiumId: 'abc-123', condominiumName: 'Residencial Sol' }, env))
  assert.equal(url.searchParams.get('plano'), 'PRO')
  assert.equal(url.searchParams.get('valor_centavos'), String(PLANS.PRO.priceCents))
  assert.equal(url.searchParams.get('condominio'), 'abc-123')
  assert.equal(url.searchParams.get('referencia'), 'Residencial Sol')
})

test('assinatura: evento do provedor vira situacao do plano sem perder o resto', () => {
  assert.equal(statusDoEvento('pagamento.aprovado'), 'active')
  assert.equal(statusDoEvento('assinatura.cancelada'), 'trial')
  assert.equal(statusDoEvento('pagamento.recusado'), '', 'recusa nao derruba o plano na hora')

  const antes = { plan_name: 'PRO', trial_ends_at: '2026-10-01T00:00:00.000Z' }
  const depois = buildAssinaturaMetadata(antes, { provedor: 'asaas', status: 'active', assinaturaExternaId: 'sub_1' })
  assert.equal(depois.plan_name, 'PRO')
  assert.equal(depois.trial_ends_at, antes.trial_ends_at)
  assert.equal(readAssinatura(depois).provedor, 'asaas')
  assert.equal(readAssinatura(depois).assinaturaExternaId, 'sub_1')
  assert.equal(readAssinatura({}).provedor, '')
})

test('marca nova aplicada onde o WebCond aparece', () => {
  for (const nome of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'logo.png', 'logo.svg', 'logo-email.png']) {
    assert.ok(existsSync(new URL(`../public/${nome}`, import.meta.url)), `falta public/${nome}`)
  }

  const favicon = arquivo('public/favicon.svg')
  assert.match(favicon, /#2160C4/, 'azul da marca')
  assert.match(favicon, /#3DAE4A/, 'verde da marca')
  assert.match(favicon, /#0E1624/, 'navy da marca')
  assert.doesNotMatch(favicon, /<metadata>/, 'o metadata do kit nao vai para o navegador')

  const html = arquivo('index.html')
  assert.match(html, /apple-touch-icon\.png/)
  assert.match(html, /favicon-32\.png/)
  assert.match(html, /content="#0E1624"/)

  const manifest = JSON.parse(arquivo('public/manifest.json'))
  assert.equal(manifest.background_color, '#0E1624')
  assert.equal(manifest.theme_color, '#2160C4')

  // E-mail: logo em PNG (aplicativo de e-mail nao abre SVG) e botao no azul da marca.
  const email = buildEmailMessage(
    { condo: 'Condo', title: 'Aviso', body: 'texto', url: '/morador' },
    { personName: 'Ana', appUrl: 'https://webcond.vercel.app' },
  )
  assert.match(email.html, /https:\/\/webcond\.vercel\.app\/logo-email\.png/)
  assert.match(email.html, /background:#2160C4/)
  assert.doesNotMatch(email.html, /logo-email\.svg/)
})

test('a pasta do projeto nao carrega mais o que nao e do projeto', () => {
  assert.ok(!existsSync(new URL('../logos/support.js', import.meta.url)), 'runtime de terceiro fora do repositorio')
  assert.ok(!existsSync(new URL('../schema.sql', import.meta.url)), 'a base do banco foi para sql/base/')
  assert.ok(existsSync(new URL('../sql/base/schema.sql', import.meta.url)))
  assert.ok(existsSync(new URL('../logos/LEIA-ME.md', import.meta.url)))
})
