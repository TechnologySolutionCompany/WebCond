import { json, rejectForeignOrigin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { buildImportResponse, PENDING_SQL_MESSAGE, prepareUnitImport } from '../../_lib/unitImportRequest.js'
import { isMissingTableError } from '../../_lib/unitLimit.js'
import { persistImportRows, UNIT_IMPORT_FAILURE_GUIDANCE } from '../../_lib/unitImportPersist.js'
import { releasePerson, saveUnitPerson } from '../../_lib/residentAccounts.js'

// Resultado guardado de um lote que ja foi confirmado antes (reenvio ou clique repetido).
function storedResult(items) {
  const created = items.filter((item) => item.status === 'criada')
  return {
    criadas: created.length,
    reaproveitadas: created.length,
    unidades: created.map((item) => ({ numero: item.numero, lineNumber: item.linha })),
    falhas: items.filter((item) => item.status === 'falhou').map((item) => ({
      lineNumber: item.linha,
      unit: item.numero || 'Não informada',
      field: 'Unidade',
      code: 'FALHA_NO_CADASTRO',
      message: item.erro,
      guidance: UNIT_IMPORT_FAILURE_GUIDANCE,
    })),
  }
}

// Etapa 2: revalida a mesma planilha e grava as unidades validas, uma a uma.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const prepared = await prepareUnitImport(req)
  if (prepared.error) return prepared.error

  const { body, condominiumId, fileHash, validation, capacity } = prepared
  const batchId = String(body.batchId || '').trim()
  if (!batchId) return json({ error: 'Analise a planilha antes de confirmar a importação.' }, 400)

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('unidade_importacoes')
    .select('id, condominium_id, arquivo_hash, status')
    .eq('id', batchId)
    .maybeSingle()

  if (batchError) {
    const missing = isMissingTableError(batchError)
    return json({ error: missing ? PENDING_SQL_MESSAGE : 'Não foi possível carregar o lote da importação.' }, missing ? 503 : 500)
  }
  if (!batch || batch.condominium_id !== condominiumId) {
    return json({ error: 'Análise não encontrada. Analise a planilha novamente antes de confirmar.' }, 404)
  }
  // O lote fica preso ao arquivo analisado: trocar a planilha exige nova análise.
  if (batch.arquivo_hash !== fileHash) {
    return json({ error: 'O arquivo enviado é diferente do que foi analisado. Analise a planilha novamente.' }, 409)
  }

  const { data: previousItems } = await supabaseAdmin
    .from('unidade_importacao_itens')
    .select('numero, linha, status, unidade_id, erro')
    .eq('importacao_id', batch.id)

  if (batch.status === 'concluido') {
    return json(buildImportResponse(prepared, { batchId: batch.id, ...storedResult(previousItems || []), jaConfirmado: true }))
  }

  await supabaseAdmin.from('unidade_importacoes').update({ status: 'processando' }).eq('id', batch.id)

  const deps = {
    createUnit: async (unit) => {
      const { data, error } = await supabaseAdmin
        .from('unidades')
        .insert({ condominium_id: condominiumId, ...unit })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    deleteUnit: async (unitId) => { await supabaseAdmin.from('unidades').delete().eq('id', unitId) },
    // Reaproveita o mesmo serviço do cadastro individual: cria a conta ou vincula quem ja existe,
    // sem nunca trocar a senha de uma conta existente.
    savePerson: async ({ unitId, numero, vinculo, person }) => saveUnitPerson({
      condominiumId,
      unitId,
      unitNumber: numero,
      vinculo,
      person: { ...person, linkExisting: true },
      current: null,
      allowWithoutCpf: true,
    }),
    releasePerson,
    existingItems: new Map((previousItems || []).map((item) => [item.numero, item])),
    markItem: async ({ numero, linha, status, unidadeId = null, erro = '' }) => {
      await supabaseAdmin
        .from('unidade_importacao_itens')
        .upsert({ importacao_id: batch.id, numero, linha, status, unidade_id: unidadeId, erro }, { onConflict: 'importacao_id,numero' })
    },
  }

  const outcome = await persistImportRows(validation.rows, deps, { capacity })
  const criadas = outcome.created.length + outcome.skipped.length

  // O login do morador e por CPF: quem entrou sem CPF fica cadastrado, mas ainda sem acesso.
  const gravadas = new Set(outcome.created.map((item) => item.numero))
  const semAcesso = validation.rows
    .filter((row) => gravadas.has(row.numero))
    .flatMap((row) => [row.owner, row.resident])
    .filter((person) => person && person.nome && !person.cpf).length

  await supabaseAdmin
    .from('unidade_importacoes')
    .update({
      status: 'concluido',
      unidades_criadas: criadas,
      unidades_com_falha: outcome.failed.length,
      confirmado_em: new Date().toISOString(),
    })
    .eq('id', batch.id)

  return json(buildImportResponse(prepared, {
    batchId: batch.id,
    criadas,
    reaproveitadas: outcome.skipped.length,
    semAcesso,
    falhas: outcome.failed,
    unidades: [...outcome.created, ...outcome.skipped],
  }))
}
