import { isPlatformAdminRole, json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { verifyOwnPassword } from '../../_lib/passwordCheck.js'

const BUCKETS = ['cobrancas', 'documentos', 'suporte']
// Ordem importa: quem aponta para outra tabela sai antes dela.
const TABLES = ['cobrancas', 'avisos', 'documentos', 'ocorrencias_predio', 'solicitacoes_cadastro', 'suporte_chamados', 'unidade_importacoes', 'condominio_convites']

// Tabela ainda nao criada (SQL pendente) nao impede a exclusao do resto.
const missingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01'

// Todos os arquivos dentro da pasta do condominio, descendo nas subpastas.
async function listFolder(bucket, prefix) {
  const found = []
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) return found
  for (const entry of data || []) {
    const path = `${prefix}/${entry.name}`
    if (entry.id === null) found.push(...await listFolder(bucket, path))
    else found.push(path)
  }
  return found
}

// Arquivos antigos (anteriores a pasta por condominio) so sao achados pelos registros.
async function referencedFiles(condominiumId) {
  const byBucket = { cobrancas: new Set(), documentos: new Set() }
  const scope = `condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`
  const [charges, documents] = await Promise.all([
    supabaseAdmin.from('cobrancas').select('boleto_path, pagamento_anexo_path').or(scope),
    supabaseAdmin.from('documentos').select('arquivo_path').or(scope),
  ])
  for (const row of charges.data || []) {
    if (row.boleto_path) byBucket.cobrancas.add(row.boleto_path)
    if (row.pagamento_anexo_path) byBucket.cobrancas.add(row.pagamento_anexo_path)
  }
  for (const row of documents.data || []) if (row.arquivo_path) byBucket.documentos.add(row.arquivo_path)
  return byBucket
}

// Exclui o condominio e tudo o que pertence a ele. Nao ha como desfazer.
// Exige a senha do admin da plataforma, conferida de novo no servidor.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const condominiumId = String(body?.condominiumId || '').trim()
  if (!condominiumId) return json({ error: 'Informe o condominio.' }, 400)

  const wrong = await verifyOwnPassword(auth.user, body?.password, { scope: 'excluir-condominio' })
  if (wrong) return wrong

  const { data: condominium, error: condominiumError } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome')
    .eq('id', condominiumId)
    .maybeSingle()
  if (condominiumError) return json({ error: 'Nao foi possivel carregar o condominio.' }, 500)
  if (!condominium) return json({ error: 'Condominio nao encontrado.' }, 404)

  const scope = `condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`
  const { data: people, error: peopleError } = await supabaseAdmin.from('profiles').select('id, role').or(scope)
  if (peopleError) return json({ error: 'Nao foi possivel carregar as pessoas do condominio.' }, 500)
  // Um admin da plataforma nunca e apagado junto, mesmo que esteja ligado ao condominio.
  const removable = (people || []).filter((person) => !isPlatformAdminRole(person.role))

  // 1. Arquivos
  const referenced = await referencedFiles(condominiumId)
  let files = 0
  for (const bucket of BUCKETS) {
    const paths = new Set([...(await listFolder(bucket, condominiumId)), ...(referenced[bucket] || [])])
    const list = [...paths]
    for (let index = 0; index < list.length; index += 100) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(list.slice(index, index + 100))
      if (!error) files += list.slice(index, index + 100).length
    }
  }

  // 2. Registros
  const counts = {}
  for (const table of TABLES) {
    const query = supabaseAdmin.from(table).delete({ count: 'exact' })
    const { error, count } = ['unidade_importacoes', 'condominio_convites', 'suporte_chamados'].includes(table)
      ? await query.eq('condominium_id', condominiumId)
      : await query.or(scope)
    if (error && !missingTable(error)) return json({ error: `Nao foi possivel apagar ${table}. Nada mais foi removido depois disso.` }, 500)
    counts[table] = count || 0
  }

  const { data: units } = await supabaseAdmin.from('unidades').select('id').eq('condominium_id', condominiumId)
  const unitIds = (units || []).map((unit) => unit.id)
  if (unitIds.length) await supabaseAdmin.from('unidade_vinculos').delete().in('unidade_id', unitIds)
  const { error: unitsError, count: unitsCount } = await supabaseAdmin.from('unidades').delete({ count: 'exact' }).eq('condominium_id', condominiumId)
  if (unitsError && !missingTable(unitsError)) return json({ error: 'Nao foi possivel apagar as unidades.' }, 500)

  // 3. Pessoas: perfil e conta de acesso
  let accounts = 0
  for (const person of removable) {
    await supabaseAdmin.from('unidade_vinculos').delete().eq('profile_id', person.id)
    await supabaseAdmin.from('profiles').delete().eq('id', person.id)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(person.id)
    if (!error) accounts += 1
  }

  // 4. O condominio
  const { error: deleteError } = await supabaseAdmin.from('condominiums').delete().eq('id', condominiumId)
  if (deleteError) return json({ error: 'Os dados foram apagados, mas o condominio em si nao. Tente excluir de novo.' }, 500)

  return json({
    success: true,
    nome: condominium.name || condominium.nome || '',
    removidos: {
      pessoas: accounts,
      unidades: unitsCount || 0,
      cobrancas: counts.cobrancas,
      avisos: counts.avisos,
      documentos: counts.documentos,
      arquivos: files,
    },
  })
}
