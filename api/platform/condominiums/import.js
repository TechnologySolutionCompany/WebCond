import { randomInt } from 'node:crypto'
import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { checkUnitAvailability, loadUnitUsage, normalizeApartment } from '../../_lib/unitLimit.js'
import { linkPersonToUnit } from '../../_lib/residentAccounts.js'

const MAX_ROWS = 500
const MANAGEABLE_ROLES = new Set(['morador', 'resident', 'contador'])

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let index = 0; index < 8; index += 1) suffix += alphabet[randomInt(alphabet.length)]
  return `Wc@${suffix}`
}

function parseEntryDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null
}

function sanitizeRow(row = {}) {
  const role = String(row.perfil || row.role || '').trim().toLowerCase() === 'contador' ? 'contador' : 'morador'
  return {
    nome: String(row.nome || '').trim(),
    cpf: String(row.cpf || '').replace(/\D/g, ''),
    email: String(row.email || '').trim().toLowerCase(),
    whatsapp: String(row.whatsapp || '').replace(/\D/g, ''),
    apartamento: String(row.apartamento || '').trim(),
    role,
    vinculo: role === 'morador' ? (String(row.vinculo || '').trim().toLowerCase().startsWith('inquil') ? 'inquilino' : 'proprietario') : '',
    data_entrada: parseEntryDate(row.data_entrada),
  }
}

// Importa moradores/contadores de uma planilha exportada de outro condominio.
// - CPF ja existente em outro condominio: o cadastro e transferido e mantem a senha atual.
// - CPF ja existente neste condominio: os dados sao atualizados.
// - CPF novo: cria o acesso com senha temporaria (devolvida no relatorio).
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const condominiumId = String(body?.condominiumId || '').trim()
  const rows = Array.isArray(body?.rows) ? body.rows : null

  if (!condominiumId || !rows) {
    return json({ error: 'Informe o condominio e as linhas da planilha.' }, 400)
  }
  if (rows.length === 0 || rows.length > MAX_ROWS) {
    return json({ error: `A planilha precisa ter entre 1 e ${MAX_ROWS} cadastros.` }, 400)
  }

  const { data: condominium } = await supabaseAdmin.from('condominiums').select('id').eq('id', condominiumId).maybeSingle()
  if (!condominium) {
    return json({ error: 'Condominio nao encontrado.' }, 404)
  }

  let usage
  try {
    usage = await loadUnitUsage(condominiumId)
  } catch (error) {
    return json({ error: error.message }, 500)
  }

  const results = []
  const seenCpfs = new Set()

  for (const [index, rawRow] of rows.entries()) {
    const row = sanitizeRow(rawRow)
    const line = index + 2 // linha 1 da planilha e o cabecalho
    const report = (status, detail, extra = {}) => results.push({ linha: line, nome: row.nome, cpf: row.cpf, apartamento: row.apartamento, status, detalhe: detail, ...extra })

    if (!row.nome || row.cpf.length !== 11) {
      report('erro', 'Nome e CPF com 11 digitos sao obrigatorios.')
      continue
    }
    if (row.role === 'morador' && !row.apartamento) {
      report('erro', 'Morador sem apartamento.')
      continue
    }
    if (seenCpfs.has(row.cpf)) {
      report('erro', 'CPF repetido na planilha.')
      continue
    }
    seenCpfs.add(row.cpf)

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, condominium_id, condominio_id')
      .eq('cpf', row.cpf)
      .limit(2)

    if (existingError || (existing || []).length > 1) {
      report('erro', existingError ? 'Falha ao consultar o CPF.' : 'CPF duplicado no sistema; corrija antes de importar.')
      continue
    }

    const current = existing?.[0]
    if (current && !MANAGEABLE_ROLES.has(String(current.role || '').trim().toLowerCase())) {
      report('erro', 'CPF pertence a um sindico/administrador; nao pode ser importado como morador.')
      continue
    }

    const alreadyHere = current && (current.condominium_id || current.condominio_id) === condominiumId
    if (row.role === 'morador') {
      const unitError = checkUnitAvailability(usage, row.apartamento)
      if (unitError && !alreadyHere) {
        report('erro', unitError)
        continue
      }
    }

    const profileFields = {
      condominium_id: condominiumId,
      condominio_id: condominiumId,
      role: row.role,
      vinculo: row.vinculo,
      ativo: true,
      nome: row.nome,
      apartamento: row.role === 'morador' ? normalizeApartment(row.apartamento) : row.apartamento,
      whatsapp: row.whatsapp,
      cpf: row.cpf,
      data_entrada: row.data_entrada,
      updated_at: new Date().toISOString(),
    }

    let profileId = current?.id || null
    if (current) {
      const { error } = await supabaseAdmin.from('profiles').update(profileFields).eq('id', current.id)
      if (error) {
        report('erro', 'Falha ao atualizar o cadastro existente.')
        continue
      }
      await supabaseAdmin.auth.admin.updateUserById(current.id, { user_metadata: { role: row.role, nome: row.nome, cpf: row.cpf } })
      report(alreadyHere ? 'atualizado' : 'transferido', alreadyHere ? 'Dados atualizados.' : 'Transferido; mantem a senha atual.')
    } else {
      const email = row.email || `morador-${row.cpf}-${condominiumId}@login.webcond.local`
      const password = generateTemporaryPassword()
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: row.role, nome: row.nome, cpf: row.cpf },
      })

      if (createError || !created?.user?.id) {
        report('erro', createError?.message?.toLowerCase().includes('already') ? 'E-mail ja usado por outro usuario.' : 'Falha ao criar o acesso.')
        continue
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({ id: created.user.id, email, telefone: '', ...profileFields }, { onConflict: 'id' })

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id)
        report('erro', 'Falha ao salvar o perfil.')
        continue
      }

      profileId = created.user.id
      report('criado', 'Acesso criado com senha temporaria.', { senha_temporaria: password })
    }

    if (row.role === 'morador') {
      const numero = normalizeApartment(row.apartamento)
      // Garante a unidade (alugada quando vier inquilino) e o vinculo pessoa <-> unidade.
      if (!usage.apartments.has(numero)) {
        await supabaseAdmin.from('unidades').insert({ condominium_id: condominiumId, numero, situacao: row.vinculo === 'inquilino' ? 'alugada' : 'ocupada' })
      } else if (row.vinculo === 'inquilino') {
        await supabaseAdmin.from('unidades').update({ situacao: 'alugada' }).eq('condominium_id', condominiumId).eq('numero', numero)
      }
      usage.apartments.add(numero)
      const { data: unit } = await supabaseAdmin.from('unidades').select('id').eq('condominium_id', condominiumId).eq('numero', numero).maybeSingle()
      if (unit && profileId) await linkPersonToUnit({ unitId: unit.id, profileId, vinculo: row.vinculo })
    }
  }

  const summary = results.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {})
  return json({ success: true, summary, results })
}
