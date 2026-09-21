import { json, rejectForeignOrigin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { buildImportResponse, PENDING_SQL_MESSAGE, prepareUnitImport } from '../../_lib/unitImportRequest.js'
import { isMissingTableError } from '../../_lib/unitLimit.js'

// Etapa 1: le a planilha, valida tudo e devolve a previa. Nao grava nenhuma unidade.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const prepared = await prepareUnitImport(req)
  if (prepared.error) return prepared.error

  const { condominiumId, filename, fileHash, validation, auth } = prepared
  const { summary } = validation

  // O lote guarda totais e o hash do arquivo; a confirmacao so aceita a mesma planilha.
  const { data: batch, error } = await supabaseAdmin
    .from('unidade_importacoes')
    .insert({
      condominium_id: condominiumId,
      created_by: auth.profile?.id || null,
      arquivo: filename,
      arquivo_hash: fileHash,
      status: 'analisado',
      total_linhas: summary.totalRows,
      unidades_validas: summary.validUnits,
      unidades_com_erro: summary.invalidUnits,
      linhas_vazias: summary.emptyRows,
    })
    .select('id')
    .single()

  if (error) {
    return json({ error: isMissingTableError(error) ? PENDING_SQL_MESSAGE : 'Não foi possível registrar a análise da planilha.' }, isMissingTableError(error) ? 503 : 500)
  }

  return json(buildImportResponse(prepared, { batchId: batch.id }))
}
