import {
  checkRateLimit,
  ensureServiceRoleConfig,
  getClientIp,
  json,
  parseJsonBody,
  rejectForeignOrigin,
  supabaseAdmin,
} from '../_lib/supabaseAdmin.js'
import { getCondominiumAccessState } from '../../src/lib/condominiumPlan.js'
import { isCpfValid, isEmailValid, isWhatsappValid, normalizeCpfDigits, normalizeWhatsapp } from '../_lib/personValidation.js'
import { normalizeUnitNumber } from '../../src/lib/units.js'
import { buildInternalResidentEmail } from '../_lib/residentAccounts.js'
import { registerInviteUse, resolveInvite } from '../_lib/signupLink.js'
import { POLICY_VERSION } from '../../src/lib/politicas.js'

const MOTIVOS = {
  LINK_INVALIDO: 'Este link de cadastro nao esta mais valido. Peca um link novo ao sindico.',
  LINK_EXPIRADO: 'Este link de cadastro expirou. Peca um link novo ao sindico.',
  FALHA: 'Nao foi possivel validar o link agora. Tente novamente em alguns instantes.',
}

// Quem preenche o formulario e sempre o proprietario. A situacao do imovel decide o resto:
//   ocupada    -> so o proprietario, que mora na unidade
//   alugada    -> proprietario + inquilino (a responsabilidade e do dono, nao do sindico)
//   desocupada -> so o proprietario, com nome, CPF e WhatsApp
const SITUACOES = new Set(['ocupada', 'alugada', 'desocupada'])

// A conta nasce bloqueada no Supabase Auth (a senha ja vai hasheada para la) e so e liberada
// quando o sindico aprova. Assim a senha nunca passa por nenhuma tabela nossa.
const BANIDO_ATE_APROVACAO = '876000h'

function lerPessoa(raw) {
  const origem = raw && typeof raw === 'object' ? raw : {}
  return {
    nome: String(origem.nome || '').trim().replace(/\s+/g, ' '),
    rawCpf: String(origem.cpf || '').trim(),
    cpf: normalizeCpfDigits(origem.cpf),
    rawWhatsapp: String(origem.whatsapp || '').trim(),
    whatsapp: normalizeWhatsapp(origem.whatsapp),
    email: String(origem.email || '').trim().toLowerCase(),
    password: String(origem.password || ''),
  }
}

// Mesmas regras para proprietario e inquilino. `exigeSenha` e falso para o inquilino
// que nao vai usar a plataforma: ele fica cadastrado, mas sem conta.
function validarPessoa(pessoa, rotulo, { exigeSenha }) {
  if (!pessoa.nome || pessoa.nome.length < 3 || pessoa.nome.length > 120) {
    return `Informe o nome completo do ${rotulo}.`
  }
  if (!isCpfValid(pessoa.rawCpf)) return `Informe um CPF valido para o ${rotulo}.`
  if (!isWhatsappValid(pessoa.rawWhatsapp, pessoa.whatsapp)) return `Informe um WhatsApp valido com DDD para o ${rotulo}.`
  if (pessoa.email && !isEmailValid(pessoa.email)) return `Informe um e-mail valido para o ${rotulo} ou deixe em branco.`
  if (exigeSenha && pessoa.password.length < 6) return `A senha do ${rotulo} precisa ter pelo menos 6 caracteres.`
  return ''
}

// Cria a conta bloqueada e o perfil inativo de uma pessoa. Devolve { profileId } ou { error, status }.
async function criarPessoaPendente(pessoa, { condominiumId, vinculo, apartamento, rotulo }) {
  const loginEmail = pessoa.email || buildInternalResidentEmail(pessoa.cpf, condominiumId)
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: loginEmail,
    password: pessoa.password,
    email_confirm: true,
    ban_duration: BANIDO_ATE_APROVACAO,
    user_metadata: { role: 'morador', nome: pessoa.nome, cpf: pessoa.cpf },
  })

  const profileId = created?.user?.id
  if (createError || !profileId) {
    const duplicate = String(createError?.message || '').toLowerCase().includes('already')
    return {
      error: duplicate
        ? `O e-mail do ${rotulo} ja esta em uso. Informe outro ou deixe o campo em branco.`
        : 'Nao foi possivel registrar o cadastro agora.',
      status: duplicate ? 409 : 500,
    }
  }

  const agora = new Date().toISOString()
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: profileId,
    condominium_id: condominiumId,
    condominio_id: condominiumId,
    role: 'morador',
    vinculo,
    ativo: false,
    nome: pessoa.nome,
    cpf: pessoa.cpf,
    whatsapp: pessoa.whatsapp,
    email: loginEmail,
    telefone: '',
    apartamento,
    data_entrada: null,
    observacao: 'Auto-cadastro por link, aguardando aprovacao do sindico.',
    aceite_versao: POLICY_VERSION,
    aceite_em: agora,
    updated_at: agora,
  }, { onConflict: 'id' })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(profileId)
    return { error: 'Nao foi possivel registrar o cadastro agora.', status: 500 }
  }

  return { profileId }
}

async function desfazerPessoa(profileId) {
  if (!profileId) return
  await supabaseAdmin.from('profiles').delete().eq('id', profileId)
  await supabaseAdmin.auth.admin.deleteUser(profileId)
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const clientIp = getClientIp(req)
  const rateLimitError = checkRateLimit(`cadastro-enviar:${clientIp}`, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const situacao = String(body.situacao || '').trim().toLowerCase()
  const apartamento = normalizeUnitNumber(body.apartamento)
  const mensagem = String(body.mensagem || '').trim().slice(0, 500)
  const aceite = body.aceite === true
  const proprietario = lerPessoa(body.proprietario)
  const alugado = situacao === 'alugada'
  const inquilinoComAcesso = alugado && body.inquilino?.acesso === true
  const inquilino = alugado ? lerPessoa(body.inquilino) : null

  if (!SITUACOES.has(situacao)) {
    return json({ error: 'Informe a situacao do imovel.' }, 400)
  }
  if (!apartamento || apartamento.length > 20) {
    return json({ error: 'Informe o numero da sua unidade.' }, 400)
  }
  if (!aceite) {
    return json({ error: 'E preciso aceitar os termos de uso e a politica de privacidade.' }, 400)
  }

  const donoInvalido = validarPessoa(proprietario, 'proprietario', { exigeSenha: true })
  if (donoInvalido) return json({ error: donoInvalido }, 400)

  if (inquilino) {
    const inquilinoInvalido = validarPessoa(inquilino, 'inquilino', { exigeSenha: inquilinoComAcesso })
    if (inquilinoInvalido) return json({ error: inquilinoInvalido }, 400)
    if (inquilino.cpf === proprietario.cpf) {
      return json({ error: 'O CPF do inquilino precisa ser diferente do CPF do proprietario.' }, 400)
    }
  }

  const resolved = await resolveInvite(body.token)
  if (resolved.error) {
    return json({ code: resolved.error, error: MOTIVOS[resolved.error] || MOTIVOS.FALHA }, resolved.error === 'FALHA' ? 503 : 404)
  }

  const condominiumId = resolved.condominium.id
  const access = getCondominiumAccessState(resolved.condominium)
  // Plano vencido deixa o painel so para leitura: o sindico nao consegue aprovar, entao nao recebe cadastro.
  if (access.shouldBlockAccess || access.planLocked) {
    return json({ error: 'Este condominio ainda nao esta liberado na plataforma. Fale com o sindico.' }, 403)
  }

  // Uma solicitacao pendente por CPF em cada condominio.
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('solicitacoes_cadastro')
    .select('id')
    .eq('condominium_id', condominiumId)
    .eq('cpf', proprietario.cpf)
    .eq('status', 'pendente')
    .maybeSingle()

  if (pendingError) return json({ error: 'Nao foi possivel registrar o cadastro agora.' }, 500)
  if (pending) {
    return json({ code: 'JA_ENVIADO', error: 'Ja existe um cadastro com este CPF aguardando aprovacao do sindico.' }, 409)
  }

  // CPF ja usado em qualquer conta da plataforma: a mensagem e a mesma em todos os casos,
  // para o formulario publico nao dizer em qual condominio o CPF esta.
  const cpfs = [proprietario.cpf, ...(inquilino ? [inquilino.cpf] : [])]
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('profiles')
    .select('cpf')
    .in('cpf', cpfs)

  if (existingError) return json({ error: 'Nao foi possivel registrar o cadastro agora.' }, 500)
  if (existing?.length) {
    const doInquilino = inquilino && existing.some((item) => item.cpf === inquilino.cpf)
    return json({
      code: 'CPF_EM_USO',
      error: doInquilino
        ? 'O CPF do inquilino ja possui acesso no WebCond. Fale com o sindico.'
        : 'Este CPF ja possui acesso no WebCond. Entre com CPF e senha ou fale com o sindico.',
    }, 409)
  }

  const criado = await criarPessoaPendente(proprietario, {
    condominiumId,
    vinculo: 'proprietario',
    apartamento,
    rotulo: 'proprietario',
  })
  if (criado.error) return json({ error: criado.error }, criado.status)

  // Inquilino sem acesso fica registrado na solicitacao, para o sindico saber quem mora la,
  // mas nao ganha conta nenhuma.
  let inquilinoProfileId = null
  if (inquilinoComAcesso) {
    const criadoInquilino = await criarPessoaPendente(inquilino, {
      condominiumId,
      vinculo: 'inquilino',
      apartamento,
      rotulo: 'inquilino',
    })
    if (criadoInquilino.error) {
      await desfazerPessoa(criado.profileId)
      return json({ error: criadoInquilino.error }, criadoInquilino.status)
    }
    inquilinoProfileId = criadoInquilino.profileId
  }

  const agora = new Date().toISOString()
  const { error: requestError } = await supabaseAdmin.from('solicitacoes_cadastro').insert({
    condominium_id: condominiumId,
    condominio_id: condominiumId,
    convite_id: resolved.invite.id,
    profile_id: criado.profileId,
    nome: proprietario.nome,
    email: proprietario.email || '',
    telefone: '',
    whatsapp: proprietario.whatsapp,
    apartamento,
    cpf: proprietario.cpf,
    vinculo: 'proprietario',
    situacao,
    inquilino_profile_id: inquilinoProfileId,
    inquilino_nome: inquilino?.nome || '',
    inquilino_cpf: inquilino?.cpf || '',
    inquilino_whatsapp: inquilino?.whatsapp || '',
    inquilino_email: inquilino?.email || '',
    inquilino_acesso: Boolean(inquilinoComAcesso),
    mensagem,
    origem: 'link',
    status: 'pendente',
    aceite_versao: POLICY_VERSION,
    aceite_em: agora,
    aceite_ip: clientIp,
  })

  if (requestError) {
    await desfazerPessoa(inquilinoProfileId)
    await desfazerPessoa(criado.profileId)
    return json({ error: 'Nao foi possivel registrar o cadastro agora.' }, 500)
  }

  await registerInviteUse(resolved.invite.id, resolved.invite.usos)

  return json({
    success: true,
    condominio: resolved.condominium.name || resolved.condominium.nome || 'Condominio',
  })
}
