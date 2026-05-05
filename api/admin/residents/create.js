import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'

function generateTemporaryPassword() {
  const words = ['Sol', 'Rio', 'Mar', 'Lua', 'Eco']
  const word = words[Math.floor(Math.random() * words.length)]
  return `${word}${Math.floor(Math.random() * 900 + 100)}!`
}

function buildInternalResidentEmail(cpf, condominiumId) {
  return `morador-${cpf}-${condominiumId}@login.webcond.local`
}

async function saveResidentProfile(client, payload) {
  return client
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
}

function normalizeDuplicateError(message = '') {
  const normalized = message.toLowerCase()
  return normalized.includes('already')
    || normalized.includes('registered')
    || normalized.includes('duplicate')
}

async function validateResidentUniqueness(client, { email, cpf }) {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, cpf')
    .or(`email.eq.${email},cpf.eq.${cpf}`)

  if (error) {
    return 'Nao foi possivel validar os dados do morador.'
  }

  const emailExists = (data || []).some((item) => String(item.email || '').toLowerCase() === email)
  if (emailExists) {
    return 'Ja existe um usuario cadastrado com este e-mail.'
  }

  const cpfExists = (data || []).some((item) => String(item.cpf || '').replace(/\D/g, '') === cpf)
  if (cpfExists) {
    return 'Ja existe um morador cadastrado com este CPF.'
  }

  return null
}

export async function POST(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const nome = String(body.nome || '').trim()
  const apartamento = String(body.apartamento || '').trim()
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '')
  const cpf = String(body.cpf || '').replace(/\D/g, '')
  const password = String(body.password || '').trim()
  const role = body.role === 'contador' ? 'contador' : 'morador'
  const condominiumId = getProfileCondominiumId(auth.profile)
  const email = String(body.email || '').trim().toLowerCase() || buildInternalResidentEmail(cpf, condominiumId)

  if (!nome || !apartamento || !whatsapp) {
    return json({ error: 'Nome, apartamento e WhatsApp sao obrigatorios.' }, 400)
  }

  if (cpf.length !== 11) {
    return json({ error: 'Informe um CPF valido com 11 digitos.' }, 400)
  }

  if (password.length < 6) {
    return json({ error: 'Informe uma senha de acesso com pelo menos 6 caracteres.' }, 400)
  }

  const uniquenessError = await validateResidentUniqueness(supabaseAdmin || auth.client, { email, cpf })
  if (uniquenessError) {
    return json({ error: uniquenessError }, 409)
  }

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError || !supabaseAdmin) {
    return json({ error: serviceRoleError }, 503)
  }

  const profilePayloadBase = {
    condominium_id: condominiumId,
    condominio_id: condominiumId,
    role,
    ativo: true,
    nome,
    email,
    apartamento,
    telefone: '',
    whatsapp,
    cpf,
    data_entrada: null,
    updated_at: new Date().toISOString(),
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, nome, cpf },
  })

  if (createError) {
    if (normalizeDuplicateError(createError.message)) {
      return json({ error: 'Ja existe um usuario cadastrado com este e-mail.' }, 409)
    }

    return json({ error: createError.message || 'Falha ao criar usuario.' }, 500)
  }

  const userId = createdUser.user?.id
  if (!userId) {
    return json({ error: 'Usuario criado sem identificador valido.' }, 500)
  }

  const { error: profileError } = await saveResidentProfile(supabaseAdmin, {
    id: userId,
    ...profilePayloadBase,
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return json({ error: 'Falha ao salvar o perfil do morador.' }, 500)
  }

  return json({
    userId,
    email,
    cpf,
    temporaryPassword: password || generateTemporaryPassword(),
    authMode: 'service-role',
  })
}
