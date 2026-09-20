import { checkRateLimit, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, quoteFilterValue, rejectForeignOrigin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { STANDARD_PLAN_NAME, STANDARD_PLAN_PRICE_CENTS } from '../../../src/lib/condominiumPlan.js'
import { composeAddress, sanitizeAddress } from '../../../src/lib/address.js'

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
    .or(`email.eq.${quoteFilterValue(email)},cpf.eq.${quoteFilterValue(cpf)}`)
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

function getCpfCnpjType(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return ''
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
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const rateLimitError = checkRateLimit(`register:${getClientIp(req)}`, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) {
    return json({ error: serviceRoleError }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const name = String(body.name || '').trim()
  const cnpj = String(body.cnpj || body.document || body.condominiumDocument || '').replace(/\D/g, '')
  const condominiumDocumentType = getCpfCnpjType(cnpj)
  const addressDetails = sanitizeAddress(body.addressDetails || body.address_details)
  const address = composeAddress(addressDetails) || String(body.address || '').trim()
  const zipCode = addressDetails.zip_code || String(body.zip_code || body.zipCode || '').replace(/\D/g, '')
  const subSyndicName = String(body.subSyndicName || body.sub_syndic_name || '').trim()
  const subSyndicWhatsapp = String(body.subSyndicWhatsapp || body.sub_syndic_whatsapp || '').replace(/\D/g, '')
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '')
  const unitCount = Number(body.unit_count || body.unitCount || 0)
  const pixKey = String(body.pix_key || body.pixKey || '').trim()
  const bankDetails = String(body.bank_details || body.bankDetails || body.bank_destination || body.bankDestination || '').trim()
  const syndicName = String(body.syndic_name || body.syndicName || '').trim()
  const syndicCpf = String(body.syndic_cpf || body.syndicCpf || '').replace(/\D/g, '')
  const syndicEmail = String(body.syndic_email || body.syndicEmail || '').trim().toLowerCase()
  const password = String(body.password || '').trim()

  if (!name || !cnpj || !address || !zipCode || !whatsapp || !syndicName || !syndicCpf || !syndicEmail || !password) {
    return json({ error: 'Preencha todos os dados do condominio e do sindico.' }, 400)
  }

  if (!Number.isFinite(unitCount) || unitCount < 1) {
    return json({ error: 'Informe a quantidade de unidades do condominio.' }, 400)
  }

  if (!condominiumDocumentType) {
    return json({ error: 'Informe um CPF ou CNPJ valido para o condominio.' }, 400)
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
    return json({ error: 'Nao foi possivel validar o CPF/CNPJ do condominio.' }, 500)
  }

  if (existingCondominium) {
    return json({ error: 'Ja existe um condominio cadastrado com este CPF/CNPJ.' }, 409)
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
    plan_name: STANDARD_PLAN_NAME,
    plan_price_cents: STANDARD_PLAN_PRICE_CENTS,
    subscription_status: 'trial',
    registration_origin: 'landing',
    condominium_document_type: condominiumDocumentType,
    address_details: addressDetails,
    sub_syndic: { name: subSyndicName, whatsapp: subSyndicWhatsapp },
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
      unit_count: Math.floor(unitCount),
      pix_key: pixKey,
      chave_pix: pixKey,
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
