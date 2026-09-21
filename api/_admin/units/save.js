import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  json,
  parseJsonBody,
  rejectForeignOrigin,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'
import { checkUnitAvailability, isMissingTableError, loadUnitUsage } from '../../_lib/unitLimit.js'
import { findLinkCandidate, releasePerson, sanitizePerson, saveUnitPerson } from '../../_lib/residentAccounts.js'
import { normalizeUnitNumber, UNIT_STATUS_VALUES } from '../../../src/lib/units.js'

const PENDING_SQL_MESSAGE = 'Estrutura de unidades pendente no banco. Execute os arquivos da pasta sql/ no Supabase.'
const ROLE_LABEL = { proprietario: 'proprietario', inquilino: 'inquilino' }

async function loadUnitLinks(unitId) {
  const { data, error } = await supabaseAdmin
    .from('unidade_vinculos')
    .select('vinculo, profiles(id, cpf, nome, ativo)')
    .eq('unidade_id', unitId)
  if (error) throw Object.assign(new Error('Nao foi possivel carregar os vinculos da unidade.'), { cause: error })
  const byRole = {}
  for (const link of data || []) {
    if (link.profiles?.ativo !== false) byRole[link.vinculo] = link.profiles
  }
  return byRole
}

// Cadastra ou edita uma unidade: proprietario, inquilino (se alugada) e responsavel financeiro.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const condominiumId = getProfileCondominiumId(auth.profile)
  const unitId = String(body.unitId || '').trim() || null
  const numero = normalizeUnitNumber(body.numero)
  const situacao = String(body.situacao || '').trim().toLowerCase()
  const observacao = String(body.observacao || '').trim().slice(0, 500)
  const people = { proprietario: sanitizePerson(body.proprietario), inquilino: situacao === 'alugada' ? sanitizePerson(body.inquilino) : null }
  // Inquilino so pode ser responsavel financeiro em unidade alugada.
  const responsavel = situacao === 'alugada' && body.responsavel_financeiro === 'inquilino' ? 'inquilino' : 'proprietario'

  if (!numero) return json({ error: 'Informe o numero da unidade.' }, 400)
  if (!UNIT_STATUS_VALUES.includes(situacao)) return json({ error: 'Situacao da unidade invalida.' }, 400)

  let existing = null
  let links = {}
  try {
    if (unitId) {
      const { data, error } = await supabaseAdmin.from('unidades').select('id, numero, condominium_id').eq('id', unitId).maybeSingle()
      if (error) throw Object.assign(new Error('Nao foi possivel carregar a unidade.'), { cause: error })
      if (!data || data.condominium_id !== condominiumId) return json({ error: 'Unidade nao encontrada.' }, 404)
      existing = data
      links = await loadUnitLinks(existing.id)
    }
  } catch (loadError) {
    return json({ error: isMissingTableError(loadError.cause) ? PENDING_SQL_MESSAGE : loadError.message }, isMissingTableError(loadError.cause) ? 503 : 500)
  }

  let usage
  try {
    usage = await loadUnitUsage(condominiumId)
  } catch (usageError) {
    return json({ error: usageError.message }, 500)
  }

  const previousNumber = existing ? normalizeUnitNumber(existing.numero) : null
  if (numero !== previousNumber && usage.apartments.has(numero)) {
    return json({ error: `Ja existe uma unidade ${numero} cadastrada.` }, 409)
  }
  if (!existing) {
    const limitError = checkUnitAvailability(usage, numero)
    if (limitError) return json({ error: limitError }, 409)
  }

  // Validacoes antes de gravar qualquer coisa.
  if (situacao === 'ocupada' && !links.proprietario && !people.proprietario?.cpf) {
    return json({ error: 'Unidade ocupada precisa do proprietario cadastrado.' }, 400)
  }
  if (situacao === 'alugada' && !links.inquilino && !people.inquilino?.cpf) {
    return json({ error: 'Unidade alugada precisa do inquilino cadastrado.' }, 400)
  }
  if (responsavel === 'proprietario' && situacao !== 'desocupada' && situacao !== 'interditada' && !links.proprietario && !people.proprietario?.cpf) {
    return json({ error: 'Defina o proprietario ou escolha o inquilino como responsavel financeiro.' }, 400)
  }

  // CPF de alguem ja cadastrado neste condominio: pergunta antes de vincular (proprietario com varias unidades).
  for (const vinculo of ['proprietario', 'inquilino']) {
    const person = people[vinculo]
    if (!person?.cpf || person.linkExisting) continue
    try {
      const candidate = await findLinkCandidate(condominiumId, person.cpf, links[vinculo]?.id)
      if (candidate) {
        return json({
          code: 'NEEDS_LINK',
          vinculo,
          person: { nome: candidate.nome, cpf: candidate.cpf, apartamento: candidate.apartamento },
          error: `Este CPF ja pertence a ${candidate.nome}. Confirme para vincular como ${ROLE_LABEL[vinculo]} desta unidade.`,
        }, 409)
      }
    } catch (candidateError) {
      return json({ error: candidateError.message }, 500)
    }
  }

  const unitPayload = { condominium_id: condominiumId, numero, situacao, observacao, responsavel_financeiro: responsavel }
  const { data: savedUnit, error: unitError } = existing
    ? await supabaseAdmin.from('unidades').update(unitPayload).eq('id', existing.id).select('id').single()
    : await supabaseAdmin.from('unidades').insert(unitPayload).select('id').single()

  if (unitError) {
    if (isMissingTableError(unitError) || unitError.code === 'PGRST204') return json({ error: PENDING_SQL_MESSAGE }, 503)
    return json({ error: unitError.code === '23505' ? `Ja existe uma unidade ${numero} cadastrada.` : 'Nao foi possivel salvar a unidade.' }, 500)
  }

  const failures = []
  try {
    // Renomear: quem tem esta unidade como principal acompanha o novo numero.
    if (previousNumber && previousNumber !== numero) {
      const ids = Object.values(links).map((person) => person.id)
      if (ids.length) {
        await supabaseAdmin.from('profiles').update({ apartamento: numero }).in('id', ids).eq('apartamento', existing.numero)
      }
    }

    for (const vinculo of ['proprietario', 'inquilino']) {
      const person = people[vinculo]
      if (person?.nome || person?.cpf) {
        const result = await saveUnitPerson({ condominiumId, unitId: savedUnit.id, unitNumber: numero, vinculo, person, current: links[vinculo] })
        if (result.error) failures.push(result)
      }
    }

    // Unidade sem ninguem morando: o morador sai desta unidade (perde o acesso se nao tiver outra).
    // Ocupada mantem o morador que nao e o proprietario, como na importacao por planilha.
    if ((situacao === 'desocupada' || situacao === 'interditada') && links.inquilino) {
      await supabaseAdmin.from('unidade_vinculos').delete().eq('unidade_id', savedUnit.id).eq('vinculo', 'inquilino')
      const releaseError = await releasePerson(links.inquilino.id)
      if (releaseError) failures.push({ error: releaseError, status: 500 })
    }
  } catch (peopleError) {
    failures.push({ error: peopleError.message || 'Nao foi possivel salvar os moradores da unidade.', status: 500 })
  }

  if (failures.length) {
    // Unidade nova sem nenhum vinculo criado nao fica pela metade.
    if (!existing) {
      const { count } = await supabaseAdmin.from('unidade_vinculos').select('id', { count: 'exact', head: true }).eq('unidade_id', savedUnit.id)
      if (!count) await supabaseAdmin.from('unidades').delete().eq('id', savedUnit.id)
    }
    return json({ error: failures[0].error }, failures[0].status || 400)
  }

  return json({ success: true, unitId: savedUnit.id })
}
