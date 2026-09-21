// Preparo comum das duas etapas da importacao (analisar e confirmar).
//
// A confirmacao recebe o mesmo arquivo de novo e revalida tudo no servidor: assim as senhas
// nunca precisam ser guardadas entre as etapas, e a permissao, o condominio e os dados sao
// conferidos novamente no momento de gravar.
import { createHash } from 'node:crypto'
import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
} from './supabaseAdmin.js'
import { isMissingTableError, loadUnitUsage } from './unitLimit.js'
import { UNIT_IMPORT_LIMITS, UnitImportFileError, readUnitImportWorkbook } from './unitImportWorkbook.js'
import { validateImportRows } from './unitImportValidation.js'

export const PENDING_SQL_MESSAGE = 'Estrutura de importação pendente no banco. Execute os arquivos da pasta sql/ no Supabase.'

function fileIssue(message, guidance) {
  return { lineNumber: 0, unit: 'Não informada', field: 'Arquivo', code: 'ARQUIVO_INVALIDO', message, guidance }
}

function decodeFile(value) {
  const base64 = String(value || '').split(',').pop() || ''
  if (!base64) throw new UnitImportFileError([fileIssue('Nenhum arquivo foi enviado.', 'Selecione a planilha preenchida e tente de novo.')])
  // Limite conferido antes de alocar o arquivo inteiro na memoria.
  if (Math.ceil(base64.length * 3 / 4) > UNIT_IMPORT_LIMITS.fileBytes) {
    throw new UnitImportFileError([fileIssue('O arquivo excede o limite de 2 MB.', 'Divida os registros em arquivos menores usando o modelo oficial.')])
  }
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new UnitImportFileError([fileIssue('O arquivo enviado está vazio.', 'Envie a planilha preenchida no formato .xlsx.')])
  return buffer
}

// Pessoas do condominio usadas para reconhecer quem ja tem cadastro (CPF e email sao os identificadores).
async function loadCondominiumPeople(condominiumId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, cpf, email, role, ativo, condominium_id, condominio_id')
    .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
  if (error) throw Object.assign(new Error('Não foi possível carregar os cadastros do condomínio.'), { cause: error })
  return data || []
}

async function loadExistingUnits(condominiumId) {
  const { data, error } = await supabaseAdmin.from('unidades').select('id, numero').eq('condominium_id', condominiumId)
  if (error) throw Object.assign(new Error('Não foi possível carregar as unidades do condomínio.'), { cause: error })
  return data || []
}

async function loadExpectedCount(condominiumId) {
  const { data } = await supabaseAdmin.from('condominiums').select('unit_count').eq('id', condominiumId).maybeSingle()
  return Number(data?.unit_count || 0)
}

/**
 * Autentica, le a planilha e valida tudo. Retorna { error } pronto para resposta em caso de falha.
 * O campo `validation.rows` e interno (contem senhas) e nunca pode ir para a resposta.
 */
export async function prepareUnitImport(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return { error: auth.error }

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return { error: json({ error: serviceRoleError }, 503) }

  const body = await parseJsonBody(req)
  if (!body) return { error: json({ error: 'Corpo da requisição inválido.' }, 400) }

  const condominiumId = getProfileCondominiumId(auth.profile)
  const filename = String(body.filename || 'unidades.xlsx').trim().slice(0, 180)

  let rows
  let fileErrors = []
  let fileHash
  try {
    const buffer = decodeFile(body.file)
    fileHash = createHash('sha256').update(buffer).digest('hex')
    ;({ rawRows: rows, fileErrors = [] } = readUnitImportWorkbook(buffer, { filename }))
  } catch (readError) {
    if (readError instanceof UnitImportFileError) {
      return { error: json({ error: readError.message, errors: readError.issues, summary: null }, 422) }
    }
    return { error: json({ error: 'Não foi possível ler a planilha enviada.' }, 422) }
  }

  // Problemas do arquivo inteiro (aba, colunas desconhecidas) param antes de validar linha a linha.
  if (fileErrors.length) {
    return { error: json({ error: 'Não foi possível analisar a planilha. Confira os problemas encontrados.', errors: fileErrors, summary: null }, 422) }
  }

  let existingUnits = []
  let existingPeople = []
  let expectedUnitCount = 0
  let usage = { apartments: new Set() }
  try {
    ;[existingUnits, existingPeople, expectedUnitCount, usage] = await Promise.all([
      loadExistingUnits(condominiumId),
      loadCondominiumPeople(condominiumId),
      loadExpectedCount(condominiumId),
      loadUnitUsage(condominiumId),
    ])
  } catch (loadError) {
    const missing = isMissingTableError(loadError.cause)
    return { error: json({ error: missing ? PENDING_SQL_MESSAGE : loadError.message }, missing ? 503 : 500) }
  }

  const validation = validateImportRows(rows, {
    existingUnits,
    expectedUnitCount,
    existingPeople,
    condominiumId,
  })

  // Vagas restantes no plano de unidades contratado pelo condominio.
  const capacity = expectedUnitCount > 0 ? Math.max(0, expectedUnitCount - usage.apartments.size) : null

  return {
    auth,
    body,
    condominiumId,
    filename,
    fileHash,
    validation,
    capacity,
    expectedUnitCount,
  }
}

// Resposta publica: prévia, erros e totais. Nunca inclui `validation.rows`.
export function buildImportResponse(prepared, extra = {}) {
  const { validation, capacity } = prepared
  return {
    summary: { ...validation.summary, capacity },
    preview: validation.preview,
    errors: validation.errors,
    missing: validation.missing,
    ...extra,
  }
}
