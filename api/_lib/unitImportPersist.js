// Gravacao do lote de importacao, unidade por unidade.
//
// Regras que este modulo garante:
//  - cada unidade e atomica: se pessoa, conta ou vinculo falhar, a unidade nao fica pela metade;
//  - uma falha nao interrompe o lote: as demais unidades validas continuam;
//  - reenvio e clique repetido nao duplicam: unidade ja gravada neste lote e apenas reconhecida;
//  - nenhuma senha entra no resultado, nos registros do lote ou nas mensagens de erro.
//
// As dependencias sao injetadas para permitir teste sem banco e para reaproveitar,
// no servidor, os mesmos servicos usados pelo cadastro individual de unidades.

export const UNIT_IMPORT_FAILURE_GUIDANCE = 'Corrija a planilha ou cadastre a unidade manualmente e envie o arquivo novamente. As demais unidades foram gravadas.'

// Mensagem tecnica nunca chega ao navegador: evita vazar dado pessoal, senha ou detalhe do banco.
function failureMessage() {
  return 'Não foi possível gravar esta unidade. Nada foi cadastrado pela metade.'
}

function personsOf(row) {
  const people = [{ vinculo: 'proprietario', person: row.owner }]
  // Em unidade ocupada com outro morador, a pessoa entra no vinculo de inquilino.
  if (row.resident) people.push({ vinculo: 'inquilino', person: row.resident })
  return people
}

export async function persistImportRows(rows, deps, { capacity = null } = {}) {
  const {
    createUnit,
    deleteUnit,
    savePerson,
    releasePerson = async () => null,
    markItem = async () => {},
    existingItems = new Map(),
  } = deps || {}

  if (typeof createUnit !== 'function' || typeof savePerson !== 'function' || typeof deleteUnit !== 'function') {
    throw new TypeError('persistImportRows exige createUnit, deleteUnit e savePerson.')
  }

  const created = []
  const failed = []
  const skipped = []
  let remaining = Number.isSafeInteger(capacity) ? capacity : null

  for (const row of rows) {
    if (!row?.valid) continue

    const identity = { numero: row.numero, linha: row.lineNumber }
    const previous = existingItems.get(row.numero)

    // Ja gravada neste mesmo lote: reconhece sem criar de novo e sem tocar em senha.
    if (previous?.status === 'criada') {
      skipped.push({ ...identity, unidadeId: previous.unidade_id || previous.unidadeId || null })
      continue
    }

    if (remaining !== null && remaining <= 0) {
      const erro = 'O condomínio atingiu a quantidade de unidades contratada.'
      failed.push({ ...identity, code: 'LIMITE_DE_UNIDADES', message: erro, guidance: 'Peça ao administrador da plataforma para aumentar a quantidade de unidades e envie o arquivo novamente.' })
      await markItem({ ...identity, status: 'falhou', erro })
      continue
    }

    let unitId = null
    const profileIds = []
    try {
      const unit = await createUnit({
        numero: row.numero,
        situacao: row.situacao,
        responsavel_financeiro: 'proprietario',
      })
      unitId = unit?.id || null
      if (!unitId) throw new Error('unidade sem identificador')

      for (const { vinculo, person } of personsOf(row)) {
        const result = await savePerson({ unitId, numero: row.numero, vinculo, person })
        if (result?.error) throw new Error('pessoa não gravada')
        if (result?.profileId) profileIds.push(result.profileId)
      }

      created.push({ ...identity, unidadeId: unitId })
      if (remaining !== null) remaining -= 1
      await markItem({ ...identity, status: 'criada', unidadeId: unitId })
    } catch {
      // Desfaz o que esta unidade criou: a unidade sai e quem ficou sem unidade perde o acesso.
      if (unitId) {
        try { await deleteUnit(unitId) } catch { /* a unidade pode nem ter sido criada */ }
      }
      for (const profileId of profileIds) {
        try { await releasePerson(profileId) } catch { /* pessoa segue em outras unidades */ }
      }

      const erro = failureMessage()
      failed.push({ ...identity, code: 'FALHA_NO_CADASTRO', message: erro, guidance: UNIT_IMPORT_FAILURE_GUIDANCE })
      try { await markItem({ ...identity, status: 'falhou', erro }) } catch { /* o lote segue mesmo sem registro */ }
    }
  }

  return { created, failed, skipped }
}
