import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { validateImportRows } from '../api/_lib/unitImportValidation.js'
import { UNIT_IMPORT_COLUMNS, UNIT_IMPORT_HEADERS } from '../src/lib/unitImportColumns.js'

// Only synthetic records: credentials are generated in memory and never written to fixtures.
const ownerSecret = randomBytes(16).toString('hex')
const residentSecret = randomBytes(16).toString('hex')
const condominiumId = 'test-condominium'

function cpfFromBase(base) {
  const digits = String(base).padStart(9, '0').split('').map(Number)
  for (const size of [9, 10]) {
    const remainder = digits.reduce((sum, digit, index) => sum + digit * (size + 1 - index), 0) % 11
    digits.push(remainder < 2 ? 0 : 11 - remainder)
  }
  return digits.join('')
}

const ownerCpf = cpfFromBase(123456780)
const residentCpf = cpfFromBase(123456781)

function row(overrides = {}, lineNumber = 2) {
  return {
    lineNumber,
    values: {
      numero: '001',
      situacao: 'Ocupado',
      ownerName: 'Proprietária Fictícia D’Ávila-Silva',
      ownerCpf: '',
      ownerWhatsapp: '(85) 99999-0001',
      ownerEmail: '',
      ownerPassword: ownerSecret,
      ownerIsResident: 'Sim',
      residentName: '',
      residentCpf: '',
      residentWhatsapp: '',
      residentEmail: '',
      residentPassword: '',
      ...overrides,
    },
  }
}

function otherResident(overrides = {}, lineNumber = 2) {
  return row({
    ownerIsResident: 'Não',
    residentName: 'Morador Fictício João de Araújo',
    residentWhatsapp: '+55 (85) 99999-0002',
    residentPassword: residentSecret,
    ...overrides,
  }, lineNumber)
}

function analyze(rows, options = {}) {
  return validateImportRows(rows, { condominiumId, ...options })
}

function codes(result, lineNumber = 2) {
  return result.errors.filter((error) => error.lineNumber === lineNumber).map((error) => error.code)
}

function assertValid(result, count = 1) {
  assert.deepEqual(result.errors, [])
  assert.equal(result.summary.validUnits, count)
  assert.equal(result.summary.invalidUnits, 0)
}

function publicResult(result) {
  return {
    preview: result.preview,
    errors: result.errors,
    summary: result.summary,
    missing: result.missing,
  }
}

test('the official template contract contains all thirteen exact headers', () => {
  assert.deepEqual(UNIT_IMPORT_HEADERS, [
    'Apartamento',
    'Situação',
    'Proprietário — nome completo',
    'Proprietário — CPF',
    'Proprietário — WhatsApp',
    'Proprietário — email',
    'Proprietário — senha inicial',
    'Proprietário é o morador?',
    'Morador / inquilino — nome completo',
    'Morador / inquilino — CPF',
    'Morador / inquilino — WhatsApp',
    'Morador / inquilino — email',
    'Morador / inquilino — senha inicial',
  ])
  assert.deepEqual(UNIT_IMPORT_COLUMNS.map(({ header }) => header), UNIT_IMPORT_HEADERS)
  assert.equal(new Set(UNIT_IMPORT_COLUMNS.map(({ key }) => key)).size, 13)
})

test('occupied by owner uses the owner for both roles and accepts optional CPF/email', () => {
  const result = analyze([row()])
  assertValid(result)
  assert.equal(result.rows[0].numero, '001')
  assert.equal(result.rows[0].situacao, 'ocupada')
  assert.equal(result.rows[0].ownerIsResident, true)
  assert.equal(result.rows[0].owner.cpf, '')
  assert.equal(result.rows[0].owner.email, '')
  assert.equal(result.rows[0].resident, null)
})

test('occupied by a different resident keeps the two applicable people', () => {
  const result = analyze([otherResident()])
  assertValid(result)
  assert.equal(result.rows[0].ownerIsResident, false)
  assert.equal(result.rows[0].situacao, 'ocupada')
  assert.equal(result.rows[0].resident.nome, 'Morador Fictício João de Araújo')
  assert.equal(result.rows[0].resident.cpf, '')
  assert.equal(result.rows[0].resident.email, '')
})

test('rented unit has an owner and a tenant', () => {
  const result = analyze([otherResident({ situacao: 'Alugado' })])
  assertValid(result)
  assert.equal(result.rows[0].situacao, 'alugada')
  assert.equal(result.rows[0].ownerIsResident, false)
  assert.ok(result.rows[0].owner)
  assert.ok(result.rows[0].resident)
})

test('vacant unit accepts owner without CPF, email or telephone and has no resident', () => {
  const result = analyze([row({ situacao: 'Desocupado', ownerIsResident: '', ownerWhatsapp: '' })])
  assertValid(result)
  assert.equal(result.rows[0].situacao, 'desocupada')
  assert.equal(result.rows[0].ownerIsResident, null)
  assert.equal(result.rows[0].resident, null)
  assert.equal(result.rows[0].owner.whatsapp, '')
})

test('safe whitespace/case normalization retains apartment leading zeros', () => {
  const result = analyze([row({ numero: '  001a  ', situacao: '  oCuPaDo ', ownerIsResident: ' sIm ', ownerName: '  Ana Fictícia  ', ownerEmail: '  TESTE@example.invalid  ' })])
  assertValid(result)
  assert.equal(result.rows[0].numero, '001A')
  assert.equal(result.rows[0].owner.nome, 'Ana Fictícia')
  assert.equal(result.rows[0].owner.email, 'teste@example.invalid')
  assertValid(analyze([row(), row({ numero: '1' }, 3)]), 2)
})

test('overlong apartments fail instead of silently truncating into another unit', () => {
  const result = analyze([row({ numero: 'A'.repeat(21) })])
  assert.equal(result.summary.invalidUnits, 1)
  assert.ok(result.errors.some((error) => error.field === 'Apartamento'))
})

test('valid masked CPF is normalized without losing its leading zero', () => {
  const cpf = cpfFromBase(12345678)
  const mask = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  const result = analyze([row({ ownerCpf: mask })])
  assertValid(result)
  assert.equal(result.rows[0].owner.cpf, cpf)
  assert.equal(result.rows[0].owner.cpf[0], '0')
})

test('CPF rejects wrong length, repeated digits, bad check digits and letters', async (t) => {
  const invalidCpfs = ['123', '11111111111', `${ownerCpf.slice(0, 10)}${(Number(ownerCpf[10]) + 1) % 10}`, 'abc12345678000']
  for (const cpf of invalidCpfs) {
    await t.test(cpf, () => {
      const result = analyze([row({ ownerCpf: cpf })])
      assert.ok(codes(result).includes('CPF_INVALIDO'))
      assert.equal(result.summary.invalidUnits, 1)
    })
  }
})

test('Brazilian WhatsApp accepts mask and country prefix and stores local digits', () => {
  const result = analyze([row({ ownerWhatsapp: '+55 (85) 99999-0001' })])
  assertValid(result)
  assert.equal(result.rows[0].owner.whatsapp, '85999990001')
})

test('WhatsApp rejects invalid DDD, landline, incomplete and multiple contacts', async (t) => {
  for (const telephone of ['20999990001', '8533330001', '859999', '85999990001;85999990002']) {
    await t.test(telephone, () => {
      const result = analyze([row({ ownerWhatsapp: telephone })])
      assert.ok(codes(result).includes('TELEFONE_INVALIDO'))
    })
  }
})

test('non-empty malformed email produces a field-specific error', () => {
  const result = analyze([row({ ownerEmail: 'pessoa-sem-arroba.example.invalid' })])
  assert.ok(codes(result).includes('EMAIL_INVALIDO'))
  assert.ok(result.errors.some((error) => error.code === 'EMAIL_INVALIDO' && error.field === 'Proprietário — email'))
})

test('unknown situation and owner-resident choice are never guessed', () => {
  assert.ok(codes(analyze([row({ situacao: 'Interditada' })])).includes('SITUACAO_INVALIDA'))
  assert.ok(codes(analyze([row({ ownerIsResident: 'Talvez' })])).includes('VINCULO_INCOMPATIVEL'))
  assert.ok(codes(analyze([row({ ownerIsResident: '' })])).includes('VINCULO_INCOMPATIVEL'))
})

test('occupation constraints reject conflicting resident data', async (t) => {
  const cases = [
    ['owner living there', row({ residentName: 'Outra Pessoa Fictícia' })],
    ['rented owner living there', otherResident({ situacao: 'Alugado', ownerIsResident: 'Sim' })],
    ['vacant owner choice', row({ situacao: 'Desocupado', ownerIsResident: 'Não' })],
    ['vacant resident data', row({ situacao: 'Desocupado', ownerIsResident: '', residentName: 'Pessoa Fictícia' })],
  ]
  for (const [label, input] of cases) {
    await t.test(label, () => assert.ok(codes(analyze([input])).includes('VINCULO_INCOMPATIVEL')))
  }
})

test('applicable names are mandatory and accept accents, apostrophes and hyphens', async (t) => {
  assertValid(analyze([row({ ownerName: "João D'Ávila-Silva" })]))
  for (const name of ['', '123456', '---...']) {
    await t.test(name || 'empty', () => {
      const result = analyze([row({ ownerName: name })])
      assert.equal(result.summary.invalidUnits, 1)
      assert.ok(result.errors.some((error) => error.field === 'Proprietário — nome completo'))
    })
  }
  assert.ok(codes(analyze([otherResident({ residentName: '' })])).includes('NOME_OBRIGATORIO'))
})

test('current six-character password policy preserves exact leading/trailing spaces', () => {
  const password = ` ${randomBytes(2).toString('hex')} `
  const result = analyze([row({ ownerPassword: password })])
  assertValid(result)
  assert.ok(result.rows[0].owner.password === password)
  assert.ok(!JSON.stringify(publicResult(result)).includes(password))
  assert.ok(codes(analyze([row({ ownerPassword: password.slice(0, 5) })])).includes('SENHA_INVALIDA'))
})

test('current account model requires the rented owner initial password too', () => {
  const result = analyze([otherResident({ situacao: 'Alugado', ownerPassword: '' })])
  assert.ok(codes(result).includes('SENHA_INVALIDA'))
})

test('duplicates flag all contributing lines, including normalized case/spacing', () => {
  const result = analyze([
    row({ numero: '01A' }, 2),
    row({ numero: ' 01a ' }, 5),
    row({ numero: '01A' }, 9),
  ])
  const duplicateErrors = result.errors.filter((error) => error.code === 'UNIDADE_DUPLICADA_NO_ARQUIVO')
  assert.deepEqual(duplicateErrors.map((error) => error.lineNumber).sort((a, b) => a - b), [2, 5, 9])
  assert.equal(result.summary.invalidUnits, 3)
  assert.equal(result.summary.validUnits, 0)
})

test('an existing unit is reported without rejecting a different leading-zero unit', () => {
  const result = analyze([row(), row({ numero: '1' }, 3)], { existingUnits: [{ numero: '001' }] })
  assert.ok(codes(result, 2).includes('UNIDADE_JA_CADASTRADA'))
  assert.deepEqual(codes(result, 3), [])
  assert.equal(result.summary.validUnits, 1)
  assert.equal(result.summary.invalidUnits, 1)
})

test('fully empty rows are counted separately and a partial row without apartment is an error', () => {
  const result = analyze([
    { lineNumber: 2, values: {} },
    { lineNumber: 3, values: Object.fromEntries(UNIT_IMPORT_COLUMNS.map(({ key }) => [key, ''])) },
    row({ numero: '' }, 4),
    row({}, 5),
  ])
  assert.equal(result.summary.totalRows, 4)
  assert.equal(result.summary.emptyRows, 2)
  assert.equal(result.summary.validUnits, 1)
  assert.equal(result.summary.invalidUnits, 1)
  assert.ok(codes(result, 4).includes('UNIDADE_OBRIGATORIA'))
  assert.equal(result.rows.length, 2)
  assert.deepEqual(codes(result, 2), [])
})

test('two independent errors affect one unit but count as two problems', () => {
  const result = analyze([row({ ownerCpf: '11111111111', ownerEmail: 'invalid-email' })])
  assert.equal(result.summary.invalidUnits, 1)
  assert.equal(result.summary.totalErrors, 2)
  assert.deepEqual(codes(result).sort(), ['CPF_INVALIDO', 'EMAIL_INVALIDO'])
})

test('expected count reports omissions without inventing apartment numbers', () => {
  const result = analyze([row(), row({ numero: '05B' }, 3)], { expectedUnitCount: 5, existingUnits: ['GARAGEM'] })
  assertValid(result, 2)
  assert.equal(result.missing.kind, 'count')
  assert.equal(result.missing.count, 2)
  assert.deepEqual(result.missing.units, [])
  assert.equal(result.summary.missingUnits, 2)
})

test('a known expected list identifies real missing units independently of invalid and empty rows', () => {
  const result = analyze([
    row({ ownerEmail: 'bad-email' }),
    { lineNumber: 3, values: {} },
  ], {
    expectedUnits: ['001', '05B', 'GARAGEM'],
    existingUnits: ['GARAGEM'],
  })
  assert.equal(result.missing.kind, 'known')
  assert.deepEqual(result.missing.units, ['05B'])
  assert.equal(result.missing.count, 1)
  assert.equal(result.summary.invalidUnits, 1)
  assert.equal(result.summary.emptyRows, 1)
})

test('without an expected inventory, missing-unit information remains unknown', () => {
  const result = analyze([row()])
  assert.equal(result.missing.kind, 'unknown')
  assert.deepEqual(result.missing.units, [])
})

test('one owner with a reliable CPF may own several units in the same file', () => {
  const result = analyze([row({ ownerCpf }), row({ numero: '002', ownerCpf }, 3)])
  assertValid(result, 2)
})

test('a matching active account in the condominium can be reused without changing its credentials', () => {
  const result = analyze([row({ ownerCpf })], {
    existingPeople: [{ id: 'existing-owner', nome: row().values.ownerName, cpf: ownerCpf, email: '', ativo: true, role: 'morador', condominium_id: condominiumId }],
  })
  assertValid(result)
  assert.equal(result.rows[0].owner.existingProfileId, 'existing-owner')
  assert.ok(!JSON.stringify(publicResult(result)).includes(ownerSecret))
})

test('existing accounts can resolve by email without a CPF', () => {
  const result = analyze([row({ ownerEmail: 'pessoa@example.invalid' })], {
    existingPeople: [{ id: 'existing-email-owner', nome: row().values.ownerName, cpf: '', email: 'pessoa@example.invalid', ativo: true, role: 'RESIDENT', condominium_id: condominiumId }],
  })
  assertValid(result)
  assert.equal(result.rows[0].owner.existingProfileId, 'existing-email-owner')
})

test('a name or phone number alone never identifies an existing account', () => {
  const result = analyze([row()], {
    existingPeople: [{ id: 'unrelated-person', nome: row().values.ownerName, whatsapp: '85999990001', cpf: residentCpf, email: '', ativo: true, role: 'morador', condominium_id: condominiumId }],
  })
  assertValid(result)
  assert.ok(!result.rows[0].owner.existingProfileId)
})

test('cross-condominium, inactive and privileged accounts cannot be linked as residents', async (t) => {
  const defaults = { id: 'blocked-owner', nome: row().values.ownerName, cpf: ownerCpf, ativo: true, role: 'morador', condominium_id: condominiumId }
  for (const [label, overrides] of [
    ['another condominium', { condominium_id: 'other-condominium' }],
    ['inactive account', { ativo: false }],
    ['administrator', { role: 'ADMIN_CONDOMINIUM' }],
  ]) {
    await t.test(label, () => {
      const result = analyze([row({ ownerCpf })], { existingPeople: [{ ...defaults, ...overrides }] })
      assert.ok(codes(result).includes('CONFLITO_DE_USUARIO'))
    })
  }
})

test('CPF and email resolving to different accounts report a conflict', () => {
  const result = analyze([row({ ownerCpf, ownerEmail: 'different@example.invalid' })], {
    existingPeople: [
      { id: 'person-by-cpf', cpf: ownerCpf, email: 'original@example.invalid', ativo: true, role: 'morador', condominium_id: condominiumId },
      { id: 'person-by-email', cpf: residentCpf, email: 'different@example.invalid', ativo: true, role: 'morador', condominium_id: condominiumId },
    ],
  })
  assert.ok(codes(result).includes('CONFLITO_DE_USUARIO'))
})

test('conflicting records for the same CPF in the workbook affect all involved lines', () => {
  const result = analyze([
    row({ ownerCpf, ownerEmail: 'first@example.invalid' }, 2),
    row({ numero: '002', ownerCpf, ownerEmail: 'different@example.invalid' }, 3),
  ])
  assert.ok(codes(result, 2).includes('CONFLITO_DE_USUARIO'))
  assert.ok(codes(result, 3).includes('CONFLITO_DE_USUARIO'))
  assert.equal(result.summary.invalidUnits, 2)
})

test('choosing another resident with the same CPF as the owner is incompatible', () => {
  const result = analyze([otherResident({ ownerCpf, residentCpf: ownerCpf })])
  assert.ok(codes(result).includes('VINCULO_INCOMPATIVEL'))
})

test('every reported problem has a stable code, unit, line, field and correction guidance', () => {
  const result = analyze([row({ numero: '', ownerCpf: '11111111111' }, 7)])
  for (const error of result.errors) {
    assert.equal(error.lineNumber, 7)
    assert.equal(error.unit, 'Não informada')
    assert.match(error.code, /^[A-Z][A-Z0-9_]+$/)
    assert.equal(typeof error.field, 'string')
    assert.ok(error.message.length > 0)
    assert.ok(error.guidance.length > 0)
  }
})

test('server analysis keeps all secrets out of its public preview and errors and does not log them', (t) => {
  const logCalls = []
  for (const method of ['log', 'error', 'warn', 'info', 'debug']) {
    t.mock.method(console, method, (...args) => logCalls.push(args))
  }
  const result = analyze([
    otherResident({ ownerCpf: '11111111111' }),
    row({ numero: '002' }, 3),
  ])
  const output = JSON.stringify(publicResult(result))
  assert.ok(!output.includes(ownerSecret))
  assert.ok(!output.includes(residentSecret))
  assert.ok(!Object.hasOwn(result.preview[0].owner, 'password'))
  assert.ok(!Object.hasOwn(result.preview[0].resident, 'password'))
  assert.equal(logCalls.length, 0)
})

test('analysis does not modify the caller-owned rows or context', () => {
  const input = [row({ ownerCpf: ` ${ownerCpf} ` })]
  const options = { condominiumId, expectedUnits: ['001', '002'], existingUnits: [] }
  const originalInput = structuredClone(input)
  const originalOptions = structuredClone(options)
  analyze(input, options)
  assert.deepEqual(input, originalInput)
  assert.deepEqual(options, originalOptions)
})
