import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, senhaRecusadaPeloAuth, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { isCpfValid, isWhatsappValid, normalizeCpfDigits, normalizeWhatsapp } from '../_lib/personValidation.js'
import { recusaDeSenha } from '../_lib/senhaVazada.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_PASSWORD = 8
const BLOCKED = '876000h'

// Equipe de suporte: contas com acesso limitado ao painel da plataforma (chamados e status).
// So o administrador da plataforma cria, bloqueia, troca a senha ou remove essas contas.
// A conta de suporte nao tem condominio e nao passa por nenhuma regra de dados dos condominios.

function supportEmail(cpf) {
  return `suporte-${cpf}@login.webcond.local`
}

async function loadMember(id) {
  if (!UUID.test(id)) return null
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, role, nome, cpf, ativo, condominium_id, condominio_id')
    .eq('id', id)
    .maybeSingle()
  // Nunca mexe em quem nao e da equipe de suporte (sindico, morador, admin da plataforma).
  return data && String(data.role || '').toLowerCase() === 'suporte' ? data : null
}

export async function GET(req) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, cpf, whatsapp, ativo, created_at, ultimo_acesso_em')
    .eq('role', 'suporte')
    .order('created_at', { ascending: true })
  if (error) return json({ error: 'Nao foi possivel carregar a equipe.' }, 500)

  return json({
    membros: (data || []).map((member) => ({
      id: member.id,
      nome: member.nome,
      // CPF mascarado: a tela so precisa reconhecer a pessoa.
      cpf: member.cpf ? `***.${member.cpf.slice(3, 6)}.***-${member.cpf.slice(9)}` : '',
      whatsapp: member.whatsapp || '',
      ativo: member.ativo !== false,
      created_at: member.created_at,
    })),
  })
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)
  const acao = String(body.acao || '')

  if (acao === 'criar') {
    const nome = String(body.nome || '').trim().replace(/\s+/g, ' ')
    const cpf = normalizeCpfDigits(body.cpf)
    const rawWhatsapp = String(body.whatsapp || '').trim()
    const whatsapp = normalizeWhatsapp(rawWhatsapp)
    const senha = String(body.senha || '')

    if (nome.length < 3 || nome.length > 120) return json({ error: 'Informe o nome completo.' }, 400)
    if (!isCpfValid(body.cpf)) return json({ error: 'Informe um CPF valido.' }, 400)
    if (rawWhatsapp && !isWhatsappValid(rawWhatsapp, whatsapp)) return json({ error: 'Informe um WhatsApp valido com DDD.' }, 400)
    if (senha.length < MIN_PASSWORD) return json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` }, 400)

    const senhaRecusada = await recusaDeSenha(senha)
    if (senhaRecusada) return json({ error: senhaRecusada }, 400)

    // O CPF e o login: nao pode existir em outro acesso (sindico, morador ou outro suporte).
    const { data: taken, error: takenError } = await supabaseAdmin.from('profiles').select('id').eq('cpf', cpf).limit(1)
    if (takenError) return json({ error: 'Nao foi possivel validar o CPF.' }, 500)
    if (taken?.length) return json({ error: 'Este CPF ja tem acesso ao WebCond. Use outro CPF para a conta de suporte.' }, 409)

    const email = supportEmail(cpf)
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { role: 'suporte', nome },
    })
    if (createError || !created?.user) {
      const senhaFraca = senhaRecusadaPeloAuth(createError)
      if (senhaFraca) return json({ error: senhaFraca }, 400)
      const duplicate = /already|registered|exists/i.test(createError?.message || '')
      return json({ error: duplicate ? 'Ja existe uma conta de suporte com este CPF.' : 'Nao foi possivel criar a conta.' }, duplicate ? 409 : 500)
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: created.user.id,
      role: 'suporte',
      ativo: true,
      nome,
      email,
      cpf,
      whatsapp,
      telefone: '',
      apartamento: '',
      condominium_id: null,
      condominio_id: null,
      observacao: 'Equipe de suporte da plataforma (acesso limitado).',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      const sqlPending = /profiles_role_check/i.test(profileError.message || '')
      return json({ error: sqlPending ? 'Aplique o SQL 2026-09-26 antes de criar contas de suporte.' : 'Nao foi possivel criar a conta.' }, sqlPending ? 503 : 500)
    }

    // Enquanto o SQL 09-27 nao estiver aplicado, o banco gruda todo perfil novo em um condominio.
    // Uma conta de suporte assim enxergaria os dados desse condominio: nao pode existir.
    const { data: saved } = await supabaseAdmin
      .from('profiles')
      .select('condominium_id, condominio_id')
      .eq('id', created.user.id)
      .maybeSingle()
    if (saved?.condominium_id || saved?.condominio_id) {
      await supabaseAdmin.from('profiles').delete().eq('id', created.user.id)
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'Aplique o SQL 2026-09-27 antes de criar contas de suporte: sem ele a conta fica presa a um condominio.' }, 503)
    }

    return json({ success: true, id: created.user.id })
  }

  const member = await loadMember(String(body.id || ''))
  if (!member) return json({ error: 'Conta de suporte nao encontrada.' }, 404)

  if (acao === 'senha') {
    const senha = String(body.senha || '')
    if (senha.length < MIN_PASSWORD) return json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` }, 400)
    const senhaRecusada = await recusaDeSenha(senha)
    if (senhaRecusada) return json({ error: senhaRecusada }, 400)

    const { error } = await supabaseAdmin.auth.admin.updateUserById(member.id, { password: senha })
    if (error) {
      const senhaFraca = senhaRecusadaPeloAuth(error)
      return json({ error: senhaFraca || 'Nao foi possivel trocar a senha.' }, senhaFraca ? 400 : 500)
    }
    return json({ success: true })
  }

  if (acao === 'bloquear' || acao === 'liberar') {
    const ativo = acao === 'liberar'
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(member.id, { ban_duration: ativo ? 'none' : BLOCKED })
    if (authError) return json({ error: 'Nao foi possivel alterar o acesso.' }, 500)
    const { error } = await supabaseAdmin.from('profiles').update({ ativo, updated_at: new Date().toISOString() }).eq('id', member.id)
    if (error) return json({ error: 'Nao foi possivel alterar o acesso.' }, 500)
    if (!ativo) await supabaseAdmin.from('push_inscricoes').delete().eq('profile_id', member.id)
    return json({ success: true, ativo })
  }

  if (acao === 'excluir') {
    // Respostas ja dadas continuam no chamado (respondido_por vira vazio).
    await supabaseAdmin.from('push_inscricoes').delete().eq('profile_id', member.id)
    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', member.id)
    if (profileError) return json({ error: 'Nao foi possivel remover a conta.' }, 500)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(member.id)
    if (authError && !/not.?found/i.test(authError.message || '')) return json({ error: 'Perfil removido, mas o login nao foi apagado. Tente de novo.' }, 500)
    return json({ success: true })
  }

  return json({ error: 'Acao invalida.' }, 400)
}
