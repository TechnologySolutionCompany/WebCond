import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from './supabaseAdmin.js'

const RESIDENT_ROLES = new Set(['morador', 'resident'])

// Identificador interno de acesso. Com CPF ele e estavel (a mesma pessoa reencontra a conta);
// sem CPF, ganha um sufixo unico para duas pessoas do mesmo condominio nao colidirem.
// Quem fica sem CPF ainda nao consegue entrar: o login do morador e por CPF.
export function buildInternalResidentEmail(cpf, condominiumId) {
  if (!cpf) return `morador-sem-cpf-${randomUUID().slice(0, 8)}-${condominiumId}@login.webcond.local`
  return `morador-${cpf}-${condominiumId}@login.webcond.local`
}

export function sanitizePerson(person) {
  if (!person || typeof person !== 'object') return null
  return {
    nome: String(person.nome || '').trim(),
    cpf: String(person.cpf || '').replace(/\D/g, ''),
    whatsapp: String(person.whatsapp || '').replace(/\D/g, ''),
    email: String(person.email || '').trim().toLowerCase(),
    password: String(person.password || '').trim(),
    linkExisting: person.link_existing === true,
  }
}

function isDuplicateMessage(message = '') {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('already') || normalized.includes('registered') || normalized.includes('duplicate')
}

function belongsTo(profile, condominiumId) {
  return (profile?.condominium_id || profile?.condominio_id) === condominiumId
}

export async function findProfileByCpf(cpf) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, cpf, role, ativo, apartamento, condominium_id, condominio_id')
    .eq('cpf', cpf)
    .limit(2)
  if (error) throw new Error('Nao foi possivel validar o CPF.')
  return data || []
}

// Pessoa ativa deste condominio que ja usa o CPF (ex.: proprietario da unidade 001 cadastrando a 002).
// Retorna o perfil para a tela perguntar "Vincular ao proprietario X?".
export async function findLinkCandidate(condominiumId, cpf, currentProfileId) {
  if (!cpf) return null
  const matches = await findProfileByCpf(cpf)
  return matches.find((profile) => profile.id !== currentProfileId
    && profile.ativo !== false
    && belongsTo(profile, condominiumId)
    && RESIDENT_ROLES.has(String(profile.role || '').toLowerCase())) || null
}

export async function linkPersonToUnit({ unitId, profileId, vinculo }) {
  const { error: removeError } = await supabaseAdmin.from('unidade_vinculos').delete().eq('unidade_id', unitId).eq('vinculo', vinculo)
  if (removeError) return 'Nao foi possivel atualizar o vinculo da unidade.'
  const { error } = await supabaseAdmin.from('unidade_vinculos').insert({ unidade_id: unitId, profile_id: profileId, vinculo })
  return error ? 'Nao foi possivel vincular a pessoa a unidade.' : null
}

// Pessoa saiu de uma unidade: se ainda tem outras, o "apartamento principal" passa para uma delas;
// se nao tem mais nenhuma, o acesso e desativado (cadastro e cobrancas ficam no historico).
export async function releasePerson(profileId) {
  const { data: links, error } = await supabaseAdmin
    .from('unidade_vinculos')
    .select('unidades(numero)')
    .eq('profile_id', profileId)
  if (error) return 'Nao foi possivel verificar as unidades da pessoa.'

  const remaining = (links || []).map((link) => link.unidades?.numero).filter(Boolean)
  if (remaining.length) {
    const { error: updateError } = await supabaseAdmin.from('profiles').update({ apartamento: remaining[0], updated_at: new Date().toISOString() }).eq('id', profileId)
    return updateError ? 'Nao foi possivel atualizar a unidade principal da pessoa.' : null
  }

  return deactivatePeople([profileId])
}

// Bloqueia o login no Auth (~100 anos) e marca inativo. Reativar pela unidade remove o bloqueio.
export async function deactivatePeople(profileIds = []) {
  if (!profileIds.length) return null
  for (const id of profileIds) {
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  }
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .in('id', profileIds)
  return error ? 'Nao foi possivel desativar os acessos da unidade.' : null
}

async function updateAccount(profileId, person, vinculo, profileFields) {
  const authPatch = { user_metadata: { role: 'morador', nome: person.nome, cpf: person.cpf }, ban_duration: 'none' }
  if (person.password) {
    if (person.password.length < 6) return { error: `A senha do ${vinculo} precisa ter pelo menos 6 caracteres.`, status: 400 }
    authPatch.password = person.password
  }
  if (person.email) {
    authPatch.email = person.email
    authPatch.email_confirm = true
    profileFields.email = person.email
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profileId, authPatch)
  if (authError) {
    return { error: isDuplicateMessage(authError.message) ? `O e-mail do ${vinculo} ja esta em uso.` : 'Nao foi possivel atualizar o acesso.', status: 409 }
  }

  const { error } = await supabaseAdmin.from('profiles').update(profileFields).eq('id', profileId)
  return error ? { error: `Nao foi possivel salvar o ${vinculo}.`, status: 500 } : { profileId }
}

// Define quem ocupa o papel (proprietario/inquilino) na unidade. `current` e quem ja esta vinculado.
// Retorna { profileId } ou { error, status }.
// `allowWithoutCpf` e so da importacao por planilha: la o CPF e opcional e quem entra sem CPF
// fica cadastrado na unidade, mas ainda sem conseguir entrar (o login e por CPF).
export async function saveUnitPerson({ condominiumId, unitId, unitNumber, vinculo, person, current, allowWithoutCpf = false }) {
  const cpfOk = person.cpf.length === 11 || (allowWithoutCpf && person.cpf.length === 0)
  if (!person.nome || !cpfOk) {
    return { error: `Informe nome e CPF (11 digitos) do ${vinculo}.`, status: 400 }
  }

  const baseFields = { nome: person.nome, whatsapp: person.whatsapp, updated_at: new Date().toISOString() }

  // Mesma pessoa ja vinculada: so atualiza os dados.
  if (person.cpf && current && String(current.cpf || '').replace(/\D/g, '') === person.cpf) {
    return updateAccount(current.id, person, vinculo, { ...baseFields })
  }

  // Sem CPF, a unica forma de reconhecer alguem que ja existe e o e-mail, resolvido na validacao.
  // So vincula, sem mexer em senha nem dados, e so se a conta for mesmo deste condominio.
  if (!person.cpf && person.existingProfileId) {
    const { data: known, error: knownError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, condominium_id, condominio_id')
      .eq('id', person.existingProfileId)
      .maybeSingle()
    if (knownError) return { error: 'Nao foi possivel validar a pessoa ja cadastrada.', status: 500 }
    if (!known || !belongsTo(known, condominiumId) || !RESIDENT_ROLES.has(String(known.role || '').toLowerCase())) {
      return { error: `A pessoa informada como ${vinculo} pertence a outro acesso.`, status: 409 }
    }
    const linkError = await linkPersonToUnit({ unitId, profileId: known.id, vinculo })
    return linkError ? { error: linkError, status: 500 } : { profileId: known.id }
  }

  let matches = []
  if (person.cpf) {
    try {
      matches = await findProfileByCpf(person.cpf)
    } catch (error) {
      return { error: error.message, status: 500 }
    }
  }

  const existing = matches[0]
  let profileId

  if (existing) {
    const sameCondoResident = belongsTo(existing, condominiumId) && RESIDENT_ROLES.has(String(existing.role || '').toLowerCase())
    if (!sameCondoResident || matches.length > 1) {
      return { error: `O CPF do ${vinculo} ja esta cadastrado em outro acesso.`, status: 409 }
    }

    // Pessoa ativa em outra unidade: so vincula (mantem senha e dados). Inativa: reativa com os dados informados.
    if (existing.ativo !== false) {
      profileId = existing.id
    } else {
      const result = await updateAccount(existing.id, person, vinculo, { ...baseFields, cpf: person.cpf, ativo: true, apartamento: unitNumber, vinculo })
      if (result.error) return result
      profileId = existing.id
    }
  } else {
    if (person.password.length < 6) {
      return { error: `Defina uma senha de acesso (minimo 6 caracteres) para o ${vinculo}.`, status: 400 }
    }

    const email = person.email || buildInternalResidentEmail(person.cpf, condominiumId)
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: person.password,
      email_confirm: true,
      user_metadata: { role: 'morador', nome: person.nome, cpf: person.cpf },
    })

    if (createError || !created?.user?.id) {
      return { error: isDuplicateMessage(createError?.message) ? `O e-mail do ${vinculo} ja esta em uso.` : `Nao foi possivel criar o acesso do ${vinculo}.`, status: 409 }
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: created.user.id,
      condominium_id: condominiumId,
      condominio_id: condominiumId,
      role: 'morador',
      vinculo,
      ativo: true,
      email,
      telefone: '',
      data_entrada: null,
      cpf: person.cpf,
      apartamento: unitNumber,
      ...baseFields,
    }, { onConflict: 'id' })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return { error: `Nao foi possivel salvar o ${vinculo}.`, status: 500 }
    }
    profileId = created.user.id
  }

  const linkError = await linkPersonToUnit({ unitId, profileId, vinculo })
  if (linkError) return { error: linkError, status: 500 }

  if (current && current.id !== profileId) {
    const releaseError = await releasePerson(current.id)
    if (releaseError) return { error: releaseError, status: 500 }
  }

  return { profileId }
}
