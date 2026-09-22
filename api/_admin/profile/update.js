import { json, parseJsonBody, rejectForeignOrigin, requireAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { isEmailValid, isWhatsappValid, normalizeWhatsapp } from '../../_lib/personValidation.js'

const INTERNAL_EMAIL = /@login\.webcond\.local$/i

// Dados do proprio sindico (ou contador): nome, WhatsApp e e-mail.
// CPF e papel nao mudam por aqui. O e-mail e o de login, entao muda no Auth e no perfil juntos.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: true, allowLockedPlan: true })
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const nome = String(body.nome || '').trim().replace(/\s+/g, ' ')
  const rawWhatsapp = String(body.whatsapp || '').trim()
  const whatsapp = normalizeWhatsapp(rawWhatsapp)
  const email = String(body.email || '').trim().toLowerCase()

  if (nome.length < 3 || nome.length > 120) return json({ error: 'Informe o nome completo.' }, 400)
  if (rawWhatsapp && !isWhatsappValid(rawWhatsapp, whatsapp)) return json({ error: 'Informe um WhatsApp valido com DDD.' }, 400)
  if (email && (!isEmailValid(email) || INTERNAL_EMAIL.test(email))) return json({ error: 'Informe um e-mail valido.' }, 400)

  const { data: current, error: currentError } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .eq('id', auth.profile.id)
    .single()
  if (currentError || !current) return json({ error: 'Nao foi possivel carregar o seu cadastro.' }, 500)

  const previousEmail = String(current.email || '').toLowerCase()
  const changeEmail = Boolean(email) && email !== previousEmail

  // O Auth do Supabase responde e-mail repetido com um erro 500 generico: confere antes.
  if (changeEmail) {
    const { data: taken, error: takenError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .neq('id', auth.profile.id)
      .limit(1)
    if (takenError) return json({ error: 'Nao foi possivel validar o e-mail.' }, 500)
    if (taken?.length) return json({ error: 'Este e-mail ja esta em uso por outro acesso.' }, 409)
  }

  if (changeEmail) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(auth.profile.id, { email, email_confirm: true })
    if (authError) {
      const duplicate = /already|registered|exists/i.test(authError.message || '')
      return json({ error: duplicate ? 'Este e-mail ja esta em uso por outro acesso.' : 'Nao foi possivel alterar o e-mail. Ele pode ja estar em uso por outro acesso.' }, duplicate ? 409 : 500)
    }
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ nome, whatsapp, ...(changeEmail ? { email } : {}), updated_at: new Date().toISOString() })
    .eq('id', auth.profile.id)

  if (error) {
    if (changeEmail) await supabaseAdmin.auth.admin.updateUserById(auth.profile.id, { email: previousEmail, email_confirm: true })
    return json({ error: error.code === '23505' ? 'Este e-mail ja esta em uso por outro acesso.' : 'Nao foi possivel salvar o seu cadastro.' }, error.code === '23505' ? 409 : 500)
  }

  return json({ success: true, emailAlterado: changeEmail })
}
