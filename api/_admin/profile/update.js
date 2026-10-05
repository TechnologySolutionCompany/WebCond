import { json, parseJsonBody, rejectForeignOrigin, requireAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { isWhatsappValid, normalizeWhatsapp } from '../../_lib/personValidation.js'
import { trocarEmailDeLogin } from '../../_lib/contaPropria.js'
import { isValidLoginEmail, normalizeLoginEmail } from '../../../src/lib/loginEmail.js'

// Dados do proprio sindico (ou contador): nome, WhatsApp e e-mail.
// CPF e papel nao mudam por aqui. O e-mail e o de login: trocar exige a senha atual, e a troca
// segue a regra de api/_lib/contaPropria.js (a mesma do morador).
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
  const email = normalizeLoginEmail(body.email)

  if (nome.length < 3 || nome.length > 120) return json({ error: 'Informe o nome completo.' }, 400)
  if (rawWhatsapp && !isWhatsappValid(rawWhatsapp, whatsapp)) return json({ error: 'Informe um WhatsApp valido com DDD.' }, 400)
  if (email && !isValidLoginEmail(email)) return json({ error: 'Informe um e-mail valido.' }, 400)

  // E-mail vazio = manter o atual. Primeiro o e-mail (que pode ser recusado pela senha atual),
  // depois o resto: assim uma senha errada nao salva metade do formulario.
  let emailAlterado = false
  if (email) {
    const troca = await trocarEmailDeLogin(auth.user, { email, senhaAtual: body.senhaAtual })
    if (troca.error) return troca.error
    emailAlterado = troca.alterado
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ nome, whatsapp, updated_at: new Date().toISOString() })
    .eq('id', auth.profile.id)

  if (error) {
    return json({ error: emailAlterado
      ? 'O e-mail de acesso foi alterado, mas nao foi possivel salvar nome e WhatsApp. Tente de novo.'
      : 'Nao foi possivel salvar o seu cadastro.' }, 500)
  }

  return json({ success: true, emailAlterado })
}
