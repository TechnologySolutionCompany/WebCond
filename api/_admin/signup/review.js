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
import { linkPersonToUnit, releasePerson } from '../../_lib/residentAccounts.js'
import { normalizeUnitNumber } from '../../../src/lib/units.js'

const PENDING_SQL_MESSAGE = 'Estrutura de unidades pendente no banco. Execute os arquivos da pasta sql/ no Supabase.'
const CAMPOS = `id, condominium_id, condominio_id, profile_id, nome, cpf, whatsapp, email,
  apartamento, vinculo, situacao, status,
  inquilino_profile_id, inquilino_nome, inquilino_cpf, inquilino_whatsapp, inquilino_acesso`

// Carrega a solicitacao ja restrita ao condominio de quem esta aprovando: uma solicitacao
// de outro condominio simplesmente nao existe para este sindico.
async function loadRequest(requestId, condominiumId) {
  const { data, error } = await supabaseAdmin
    .from('solicitacoes_cadastro')
    .select(CAMPOS)
    .eq('id', requestId)
    .maybeSingle()

  if (error) return { error: json({ error: 'Nao foi possivel carregar a solicitacao.' }, 500) }
  const belongs = data && (data.condominium_id === condominiumId || data.condominio_id === condominiumId)
  if (!belongs) return { error: json({ error: 'Solicitacao nao encontrada.' }, 404) }
  if (data.status !== 'pendente') {
    return { error: json({ error: 'Esta solicitacao ja foi revisada.' }, 409) }
  }
  return { request: data }
}

// Apaga uma conta criada no envio: quem foi recusado nunca chegou a ter acesso.
async function discardAccount(profileId) {
  if (!profileId) return
  await supabaseAdmin.from('unidade_vinculos').delete().eq('profile_id', profileId)
  await supabaseAdmin.from('profiles').delete().eq('id', profileId)
  await supabaseAdmin.auth.admin.deleteUser(profileId)
}

async function findUnit(condominiumId, numero) {
  const { data, error } = await supabaseAdmin
    .from('unidades')
    .select('id, numero, situacao, observacao')
    .eq('condominium_id', condominiumId)
  if (error) throw Object.assign(new Error('Nao foi possivel carregar as unidades.'), { cause: error })
  return (data || []).find((unit) => normalizeUnitNumber(unit.numero) === numero) || null
}

async function loadUnitLink(unitId, vinculo) {
  const { data, error } = await supabaseAdmin
    .from('unidade_vinculos')
    .select('profile_id, profiles(id, nome, ativo)')
    .eq('unidade_id', unitId)
    .eq('vinculo', vinculo)
    .maybeSingle()
  if (error) return null
  return data?.profiles?.ativo === false ? null : data
}

// Libera uma conta que estava bloqueada desde o envio e a prende na unidade.
async function ativarPessoa(profileId, { unitId, numero, vinculo }) {
  const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(profileId, { ban_duration: 'none' })
  if (unbanError) return 'Nao foi possivel liberar o acesso do morador.'

  const { error: activateError } = await supabaseAdmin
    .from('profiles')
    .update({ ativo: true, apartamento: numero, vinculo, updated_at: new Date().toISOString() })
    .eq('id', profileId)

  if (activateError) {
    await supabaseAdmin.auth.admin.updateUserById(profileId, { ban_duration: '876000h' })
    return 'Nao foi possivel ativar o cadastro do morador.'
  }

  const linkError = await linkPersonToUnit({ unitId, profileId, vinculo })
  if (linkError) {
    await supabaseAdmin.from('profiles').update({ ativo: false }).eq('id', profileId)
    await supabaseAdmin.auth.admin.updateUserById(profileId, { ban_duration: '876000h' })
    return linkError
  }

  return null
}

// Inquilino sem acesso a plataforma nao tem conta. Para o sindico nao perder o dado,
// ele fica na observacao da unidade, sem sobrescrever o que ja estiver escrito la.
function observacaoDoInquilino(request) {
  if (!request.inquilino_nome || request.inquilino_acesso) return ''
  const contato = [request.inquilino_cpf, request.inquilino_whatsapp].filter(Boolean).join(' · ')
  return `Inquilino sem acesso a plataforma: ${request.inquilino_nome}${contato ? ` (${contato})` : ''}`
}

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
  const requestId = String(body.requestId || '').trim()
  const action = String(body.action || '').trim().toLowerCase()

  if (!requestId) return json({ error: 'Informe a solicitacao.' }, 400)
  if (action !== 'aprovar' && action !== 'recusar') {
    return json({ error: 'Acao invalida para a solicitacao.' }, 400)
  }

  const loaded = await loadRequest(requestId, condominiumId)
  if (loaded.error) return loaded.error
  const { request } = loaded

  const reviewFields = {
    revisado_por: auth.profile.id,
    revisado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (action === 'recusar') {
    await discardAccount(request.inquilino_profile_id)
    await discardAccount(request.profile_id)
    const { error } = await supabaseAdmin
      .from('solicitacoes_cadastro')
      .update({
        ...reviewFields,
        status: 'rejeitado',
        profile_id: null,
        inquilino_profile_id: null,
        motivo: String(body.motivo || '').trim().slice(0, 300),
      })
      .eq('id', request.id)

    if (error) return json({ error: 'Nao foi possivel recusar a solicitacao.' }, 500)
    return json({ success: true, status: 'rejeitado' })
  }

  // --- Aprovacao ---
  const numero = normalizeUnitNumber(body.numero || request.apartamento)
  const situacao = String(request.situacao || 'ocupada').trim().toLowerCase()
  const substituir = body.substituir === true

  if (!numero) return json({ error: 'Informe o numero da unidade.' }, 400)

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, condominium_id, condominio_id, role')
    .eq('id', request.profile_id || '')
    .maybeSingle()

  if (profileError) return json({ error: 'Nao foi possivel carregar o cadastro enviado.' }, 500)
  if (!profile || getProfileCondominiumId(profile) !== condominiumId) {
    return json({ error: 'O cadastro enviado nao esta mais disponivel. Recuse a solicitacao e peca um novo cadastro.' }, 409)
  }

  let unit
  let usage
  try {
    usage = await loadUnitUsage(condominiumId)
    unit = await findUnit(condominiumId, numero)
  } catch (loadError) {
    const missing = isMissingTableError(loadError.cause)
    return json({ error: missing ? PENDING_SQL_MESSAGE : loadError.message }, missing ? 503 : 500)
  }

  const observacao = observacaoDoInquilino(request)

  if (!unit) {
    const limitError = checkUnitAvailability(usage, numero)
    if (limitError) return json({ code: 'LIMITE_DE_UNIDADES', error: limitError }, 409)

    const { data: created, error: createError } = await supabaseAdmin
      .from('unidades')
      .insert({ condominium_id: condominiumId, numero, situacao, observacao })
      .select('id, numero, situacao, observacao')
      .single()

    if (createError || !created) {
      const missing = isMissingTableError(createError)
      return json({ error: missing ? PENDING_SQL_MESSAGE : 'Nao foi possivel criar a unidade.' }, missing ? 503 : 500)
    }
    unit = created
  }

  // Papel ja ocupado na unidade: o sindico decide se substitui.
  const papeis = [{ vinculo: 'proprietario', profileId: profile.id }]
  if (request.inquilino_profile_id) papeis.push({ vinculo: 'inquilino', profileId: request.inquilino_profile_id })

  for (const papel of papeis) {
    const currentLink = await loadUnitLink(unit.id, papel.vinculo)
    if (currentLink && currentLink.profile_id !== papel.profileId && !substituir) {
      return json({
        code: 'VINCULO_OCUPADO',
        vinculo: papel.vinculo,
        numero,
        person: { nome: currentLink.profiles?.nome || 'morador cadastrado' },
        error: `A unidade ${numero} ja tem ${papel.vinculo === 'inquilino' ? 'um inquilino' : 'um proprietario'} cadastrado.`,
      }, 409)
    }
    papel.anterior = currentLink
  }

  for (const papel of papeis) {
    const ativarError = await ativarPessoa(papel.profileId, { unitId: unit.id, numero, vinculo: papel.vinculo })
    if (ativarError) return json({ error: ativarError }, 500)
  }

  // Quem foi substituido sai da unidade (perde o acesso se nao tiver outra).
  for (const papel of papeis) {
    if (papel.anterior && papel.anterior.profile_id !== papel.profileId) {
      await releasePerson(papel.anterior.profile_id)
    }
  }

  // A unidade passa a refletir o que o proprietario declarou.
  const unitPatch = {}
  if (situacao !== unit.situacao) unitPatch.situacao = situacao
  if (observacao && !String(unit.observacao || '').trim()) unitPatch.observacao = observacao
  if (Object.keys(unitPatch).length) {
    await supabaseAdmin.from('unidades').update(unitPatch).eq('id', unit.id)
  }

  const { error: statusError } = await supabaseAdmin
    .from('solicitacoes_cadastro')
    .update({ ...reviewFields, status: 'aprovado', apartamento: numero })
    .eq('id', request.id)

  if (statusError) return json({ error: 'O acesso foi liberado, mas a solicitacao nao pode ser marcada como aprovada.' }, 500)

  return json({ success: true, status: 'aprovado', unitId: unit.id, numero })
}
