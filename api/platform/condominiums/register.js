import { ensureServiceRoleConfig, json, parseJsonBody, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

function slugify(value = '') {
  const base = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return base || `condominio-${Date.now()}`
}

async function ensureUniqueSyndic(email, cpf) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, cpf')
    .or(`email.eq.${email},cpf.eq.${cpf}`)
    .limit(2)

  if (error) {
    return 'Nao foi possivel validar os dados do sindico.'
  }

  const emailExists = (data || []).some((item) => String(item.email || '').toLowerCase() === email)
  if (emailExists) return 'Ja existe um usuario cadastrado com este e-mail.'

  const cpfExists = (data || []).some((item) => String(item.cpf || '').replace(/\D/g, '') === cpf)
  if (cpfExists) return 'Ja existe um usuario cadastrado com este CPF.'

  return null
}

async function buildUniqueSlug(name) {
  const base = slugify(name)
  let slug = base
  let counter = 1

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('condominiums')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      return `${base}-${Date.now()}`
    }

    if (!data) return slug
    counter += 1
    slug = `${base}-${counter}`
  }
}

export async function POST(req) {
  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) {
    return json({ error: serviceRoleError }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const name = String(body.name || '').trim()
  const cnpj = String(body.cnpj || '').replace(/\D/g, '')
  const address = String(body.address || '').trim()
  const zipCode = String(body.zip_code || body.zipCode || '').trim()
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '')
  const unitCount = Number(body.unit_count || body.unitCount || 0)
  const bankDetails = String(body.bank_details || body.bankDetails || '').trim()
  const syndicName = String(body.syndic_name || body.syndicName || '').trim()
  const syndicCpf = String(body.syndic_cpf || body.syndicCpf || '').replace(/\D/g, '')
  const syndicEmail = String(body.syndic_email || body.syndicEmail || '').trim().toLowerCase()
  const password = String(body.password || '').trim()

  if (!name || !cnpj || !address || !zipCode || !whatsapp || !syndicName || !syndicCpf || !syndicEmail || !password) {
    return json({ error: 'Preencha todos os dados do condominio e do sindico.' }, 400)
  }

  if (cnpj.length !== 14) {
    return json({ error: 'Informe um CNPJ valido com 14 digitos.' }, 400)
  }

  if (syndicCpf.length !== 11) {
    return json({ error: 'Informe um CPF valido com 11 digitos.' }, 400)
  }

  if (password.length < 6) {
    return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
  }

  const { data: existingCondominium, error: condominiumLookupError } = await supabaseAdmin
    .from('condominiums')
    .select('id')
    .eq('cnpj', cnpj)
    .maybeSingle()

  if (condominiumLookupError) {
    return json({ error: 'Nao foi possivel validar o CNPJ do condominio.' }, 500)
  }

  if (existingCondominium) {
    return json({ error: 'Ja existe um condominio cadastrado com este CNPJ.' }, 409)
  }

  const uniquenessError = await ensureUniqueSyndic(syndicEmail, syndicCpf)
  if (uniquenessError) {
    return json({ error: uniquenessError }, 409)
  }

  const slug = await buildUniqueSlug(name)
  const metadata = {
    request_contact_name: syndicName,
    request_contact_email: syndicEmail,
    request_contact_whatsapp: whatsapp,
    plan_name: 'Trial',
    registration_origin: 'landing',
  }

  const { data: condominium, error: createCondominiumError } = await supabaseAdmin
    .from('condominiums')
    .insert({
      name,
      nome: name,
      slug,
      cnpj,
      address,
      endereco: address,
      zip_code: zipCode,
      whatsapp,
      unit_count: Number.isFinite(unitCount) ? Math.max(unitCount, 0) : 0,
      bank_details: bankDetails,
      status: 'pending',
      metadata,
    })
    .select('id')
    .single()

  if (createCondominiumError || !condominium?.id) {
    return json({ error: createCondominiumError?.message || 'Nao foi possivel cadastrar o condominio.' }, 500)
  }

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: syndicEmail,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'ADMIN_CONDOMINIUM',
      nome: syndicName,
      cpf: syndicCpf,
    },
  })

  if (createUserError) {
    await supabaseAdmin.from('condominiums').delete().eq('id', condominium.id)
    return json({ error: createUserError.message || 'Nao foi possivel criar o acesso inicial do sindico.' }, 500)
  }

  const userId = createdUser.user?.id
  if (!userId) {
    await supabaseAdmin.from('condominiums').delete().eq('id', condominium.id)
    return json({ error: 'O acesso inicial foi criado sem identificador valido.' }, 500)
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      condominium_id: condominium.id,
      condominio_id: condominium.id,
      role: 'ADMIN_CONDOMINIUM',
      ativo: true,
      nome: syndicName,
      email: syndicEmail,
      telefone: '',
      whatsapp,
      apartamento: '',
      cpf: syndicCpf,
      observacao: 'Cadastro inicial do sindico via landing.',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    await supabaseAdmin.from('condominiums').delete().eq('id', condominium.id)
    return json({ error: 'Nao foi possivel concluir o perfil inicial do sindico.' }, 500)
  }

  return json({
    success: true,
    condominiumId: condominium.id,
    status: 'pending',
  })
}
