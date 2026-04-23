import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  isManageableTenantRole,
  isSameCondominium,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'

async function validateResidentUniqueness(userId, { email, cpf }) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, cpf')
    .neq('id', userId)
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

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) {
    return json({ error: serviceRoleError }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const userId = String(body.userId || '').trim()
  const nome = String(body.nome || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const apartamento = String(body.apartamento || '').trim()
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '')
  const cpf = String(body.cpf || '').replace(/\D/g, '')
  const dataEntrada = body.data_entrada || null
  const ativo = body.ativo !== false
  const role = body.role === 'contador' ? 'contador' : 'morador'
  const password = String(body.password || '')

  if (!userId || !nome || !email || !apartamento || !whatsapp || !dataEntrada) {
    return json({ error: 'Usuario, nome, e-mail, WhatsApp, apartamento e data de entrada sao obrigatorios.' }, 400)
  }

  if (cpf.length !== 11) {
    return json({ error: 'Informe um CPF valido com 11 digitos.' }, 400)
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, condominium_id, condominio_id')
    .eq('id', userId)
    .maybeSingle()

  if (targetProfileError) {
    return json({ error: 'Nao foi possivel validar o usuario informado.' }, 500)
  }

  if (!targetProfile) {
    return json({ error: 'Usuario nao encontrado.' }, 404)
  }

  if (!isManageableTenantRole(targetProfile.role)) {
    return json({ error: 'Esta acao esta disponivel apenas para moradores ou perfis operacionais do condominio.' }, 400)
  }

  if (!isSameCondominium(auth.profile, targetProfile)) {
    return json({ error: 'Este usuario pertence a outro condominio.' }, 403)
  }

  const uniquenessError = await validateResidentUniqueness(userId, { email, cpf })
  if (uniquenessError) {
    return json({ error: uniquenessError }, 409)
  }

  const authPayload = {
    email,
    user_metadata: { role, nome, cpf },
  }

  if (password) {
    if (password.length < 6) {
      return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
    }

    authPayload.password = password
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authPayload)
  if (authError) {
    return json({ error: authError.message || 'Nao foi possivel atualizar os dados de autenticacao.' }, 500)
  }

  const condominiumId = getProfileCondominiumId(targetProfile)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      nome,
      email,
      apartamento,
      telefone: '',
      whatsapp,
      cpf,
      data_entrada: dataEntrada,
      ativo,
      role,
      condominium_id: condominiumId,
      condominio_id: condominiumId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (profileError) {
    return json({ error: profileError.message || 'Nao foi possivel atualizar o perfil do morador.' }, 500)
  }

  return json({ success: true })
}
