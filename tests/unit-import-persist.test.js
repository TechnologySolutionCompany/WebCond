import assert from 'node:assert/strict'
import test from 'node:test'
import { persistImportRows } from '../api/_lib/unitImportPersist.js'

const SENHA = 'Segredo@123'

function row(numero, { lineNumber = 2, situacao = 'ocupada', resident = null, valid = true } = {}) {
  return {
    lineNumber,
    numero,
    situacao,
    valid,
    owner: { nome: 'Ana Souza', cpf: '', whatsapp: '81999990000', email: '', password: SENHA },
    resident,
  }
}

function fakeDeps({ failOn = null, failUnitOn = null } = {}) {
  const calls = { units: [], people: [], deleted: [], released: [], items: [] }
  let sequence = 0
  return {
    calls,
    deps: {
      createUnit: async (unit) => {
        if (failUnitOn === unit.numero) throw new Error('banco fora do ar')
        sequence += 1
        const created = { id: `unidade-${sequence}`, ...unit }
        calls.units.push(created)
        return created
      },
      deleteUnit: async (unitId) => { calls.deleted.push(unitId) },
      savePerson: async ({ unitId, numero, vinculo, person }) => {
        calls.people.push({ unitId, numero, vinculo, nome: person.nome })
        if (failOn === `${numero}:${vinculo}`) return { error: 'falha simulada' }
        return { profileId: `pessoa-${calls.people.length}` }
      },
      releasePerson: async (profileId) => { calls.released.push(profileId) },
      markItem: async (item) => { calls.items.push(item) },
    },
  }
}

test('grava as unidades validas e ignora as invalidas', async () => {
  const { deps, calls } = fakeDeps()
  const result = await persistImportRows([
    row('001'),
    row('002', { lineNumber: 3, valid: false }),
    row('003', { lineNumber: 4 }),
  ], deps)

  assert.equal(result.created.length, 2)
  assert.deepEqual(result.created.map((item) => item.numero), ['001', '003'])
  assert.equal(result.failed.length, 0)
  assert.deepEqual(calls.units.map((unit) => unit.numero), ['001', '003'])
})

test('unidade alugada cria os vinculos de proprietario e inquilino', async () => {
  const { deps, calls } = fakeDeps()
  const inquilino = { nome: 'Bruno Lima', cpf: '', whatsapp: '81988887777', email: '', password: SENHA }
  await persistImportRows([row('101', { situacao: 'alugada', resident: inquilino })], deps)

  assert.deepEqual(calls.people.map((person) => person.vinculo), ['proprietario', 'inquilino'])
  assert.equal(calls.units[0].situacao, 'alugada')
  assert.equal(calls.units[0].responsavel_financeiro, 'proprietario')
})

test('falha ao gravar o inquilino desfaz a unidade inteira e segue o lote', async () => {
  const { deps, calls } = fakeDeps({ failOn: '201:inquilino' })
  const inquilino = { nome: 'Carla Dias', cpf: '', whatsapp: '81977776666', email: '', password: SENHA }
  const result = await persistImportRows([
    row('201', { situacao: 'alugada', resident: inquilino }),
    row('202', { lineNumber: 3 }),
  ], deps)

  assert.deepEqual(result.failed.map((item) => item.numero), ['201'])
  assert.equal(result.failed[0].code, 'FALHA_NO_CADASTRO')
  assert.deepEqual(result.created.map((item) => item.numero), ['202'])
  // A unidade some e o proprietario ja gravado volta a nao ter unidade.
  assert.equal(calls.deleted.length, 1)
  assert.equal(calls.released.length, 1)
})

test('falha ao criar a unidade nao deixa pessoa nem registro parcial', async () => {
  const { deps, calls } = fakeDeps({ failUnitOn: '301' })
  const result = await persistImportRows([row('301'), row('302', { lineNumber: 3 })], deps)

  assert.deepEqual(result.failed.map((item) => item.numero), ['301'])
  assert.equal(calls.people.filter((person) => person.numero === '301').length, 0)
  assert.equal(calls.deleted.length, 0)
  assert.deepEqual(result.created.map((item) => item.numero), ['302'])
})

test('reenvio do mesmo lote nao duplica a unidade ja gravada', async () => {
  const { deps, calls } = fakeDeps()
  deps.existingItems = new Map([['401', { status: 'criada', unidade_id: 'unidade-original' }]])
  const result = await persistImportRows([row('401'), row('402', { lineNumber: 3 })], deps)

  assert.deepEqual(result.skipped.map((item) => item.numero), ['401'])
  assert.equal(result.skipped[0].unidadeId, 'unidade-original')
  assert.deepEqual(calls.units.map((unit) => unit.numero), ['402'])
  assert.equal(calls.people.filter((person) => person.numero === '401').length, 0)
})

test('unidade que falhou antes pode ser gravada no reenvio', async () => {
  const { deps, calls } = fakeDeps()
  deps.existingItems = new Map([['501', { status: 'falhou' }]])
  const result = await persistImportRows([row('501')], deps)

  assert.deepEqual(result.created.map((item) => item.numero), ['501'])
  assert.equal(calls.units.length, 1)
})

test('respeita a quantidade de unidades contratada e explica o motivo', async () => {
  const { deps } = fakeDeps()
  const result = await persistImportRows([row('601'), row('602', { lineNumber: 3 }), row('603', { lineNumber: 4 })], deps, { capacity: 2 })

  assert.equal(result.created.length, 2)
  assert.deepEqual(result.failed.map((item) => item.code), ['LIMITE_DE_UNIDADES'])
  assert.match(result.failed[0].guidance, /administrador da plataforma/)
})

test('nenhuma senha aparece no resultado nem no registro do lote', async () => {
  const { deps, calls } = fakeDeps({ failOn: '701:proprietario' })
  const result = await persistImportRows([row('701'), row('702', { lineNumber: 3 })], deps)

  const exposed = JSON.stringify({ result, items: calls.items })
  assert.ok(!exposed.includes(SENHA), 'a senha apareceu no resultado da importação')
  assert.ok(!exposed.toLowerCase().includes('password'))
  assert.ok(!exposed.includes('falha simulada'), 'detalhe técnico da falha não deve sair na resposta')
})

test('registra cada unidade do lote com status e linha', async () => {
  const { deps, calls } = fakeDeps({ failOn: '802:proprietario' })
  await persistImportRows([row('801'), row('802', { lineNumber: 7 })], deps)

  assert.deepEqual(calls.items, [
    { numero: '801', linha: 2, status: 'criada', unidadeId: 'unidade-1' },
    { numero: '802', linha: 7, status: 'falhou', erro: 'Não foi possível gravar esta unidade. Nada foi cadastrado pela metade.' },
  ])
})
