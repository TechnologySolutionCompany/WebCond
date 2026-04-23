import {
  createUserScopedServerClient,
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
  supabaseServer,
} from '../../_lib/supabaseAdmin.js'

function generateTemporaryPassword() {
  const words = ['Sol', 'Rio', 'Mar', 'Lua', 'Eco']
  const word = words[Math.floor(Math.random() * words.length)]
  return `${word}${Math.floor(Math.random() * 900 + 100)}!`
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
    return 'Não foi possível validar os dados do morador.'
  }

  const emailExists = (data || []).some((item) => String(item.email || '').toLowerCase() === email)
  if (emailExists) {
    return 'Já existe um usuário cadastrado com este e-mail.'
  }

  const cpfExists = (data || []).some((item) => String(item.cpf || '').replace(/\D/g, '') === cpf)
  if (cpfExists) {
    return 'Já existe um morador cadastrado com este CPF.'
  }

  return null
}

export async function POST(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const nome = String(body.nome || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const apartamento = String(body.apartamento || '').trim()
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '')
  const cpf = String(body.cpf || '').replace(/\D/g, '')
  const dataEntrada = body.data_entrada || null
  const role = body.role === 'contador' ? 'contador' : 'morador'

  if (!nome || !email || !apartamento || !whatsapp || !dataEntrada) {
    return json({ error: 'Nome, e-mail, WhatsApp, apartamento e data de entrada são obrigatórios.' }, 400)
  }

  if (cpf.length !== 11) {
    return json({ error: 'Informe um CPF válido com 11 dígitos.' }, 400)
  }

  const uniquenessError = await validateResidentUniqueness(supabaseAdmin || auth.client, { email, cpf })
  if (uniquenessError) {
    return json({ error: uniquenessError }, 409)
  }

  const tempPassword = generateTemporaryPassword()
  const condominiumId = getProfileCondominiumId(auth.profile)
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
    data_entrada: dataEntrada,
    updated_at: new Date().toISOString(),
  }

  if (!ensureServiceRoleConfig() && supabaseAdmin) {
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role, nome, cpf },
    })

    if (createError) {
      if (normalizeDuplicateError(createError.message)) {
        return json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, 409)
      }

      return json({ error: createError.message || 'Falha ao criar usuário.' }, 500)
    }

    const userId = createdUser.user?.id
    if (!userId) {
      return json({ error: 'Usuário criado sem identificador válido.' }, 500)
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
      temporaryPassword: tempPassword,
      authMode: 'service-role',
    })
  }

  const { data: signUpData, error: signUpError } = await supabaseServer.auth.signUp({
    email,
    password: tempPassword,
    options: {
      data: { role, nome, cpf },
    },
  })

  if (signUpError) {
    if (normalizeDuplicateError(signUpError.message)) {
      return json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, 409)
    }

    return json({ error: signUpError.message || 'Falha ao criar usuário.' }, 500)
  }

  const userId = signUpData.user?.id
  if (!userId) {
    return json({ error: 'Usuário criado sem identificador válido.' }, 500)
  }

  if (Array.isArray(signUpData.user?.identities) && signUpData.user.identities.length === 0) {
    return json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, 409)
  }

  const residentClient = signUpData.session?.access_token
    ? createUserScopedServerClient(signUpData.session.access_token)
    : auth.client

  const { error: profileError } = await saveResidentProfile(residentClient, {
    id: userId,
    ...profilePayloadBase,
  })

  if (profileError) {
    return json({
      error: 'O usuário foi criado, mas o perfil não pôde ser finalizado automaticamente. Revise as políticas RLS ou configure a SUPABASE_SERVICE_ROLE_KEY.',
    }, 500)
  }

  return json({
    userId,
    email,
    cpf,
    temporaryPassword: tempPassword,
    authMode: 'signup',
    requiresEmailConfirmation: !signUpData.session,
  })
}
