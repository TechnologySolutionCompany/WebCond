// "Esqueci a senha" na tela inicial (v2.10A2): POST /api/auth/contato-sindico { cpf }
// Devolve para qual WhatsApp a pessoa deve pedir a troca de senha: o do sindico do condominio dela
// (quem troca a senha do morador e o sindico, em Unidades) ou, quando nao der para saber, o
// suporte da TSCBr.
//
// Privacidade: rota publica. Nao devolve nome, condominio nem se o CPF existe. CPF desconhecido,
// conta inativa, sindico/equipe e condominio sem WhatsApp recebem a mesma resposta (TSCBr).
// Limite de tentativas por IP e por CPF contra quem tentar varrer CPFs.
import { checkRateLimit, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { TSC_WHATSAPP } from '../../src/lib/contato.js'

const MORADORES = ['morador', 'proprietario', 'inquilino', 'contador']

function normalizarWhatsapp(valor = '') {
  const digitos = String(valor || '').replace(/\D/g, '')
  if (digitos.length < 10) return ''
  return digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`
}

const suporte = () => json({ destino: 'suporte', whatsapp: TSC_WHATSAPP })

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const ipLimit = checkRateLimit(`contato-sindico:ip:${getClientIp(req)}`, { limit: 5, windowMs: 15 * 60 * 1000 })
  if (ipLimit) return ipLimit

  const body = await parseJsonBody(req)
  const cpf = String(body?.cpf || '').replace(/\D/g, '')
  if (cpf.length !== 11) return json({ error: 'Informe o seu CPF.' }, 400)

  const cpfLimit = checkRateLimit(`contato-sindico:cpf:${cpf}`, { limit: 3, windowMs: 15 * 60 * 1000 })
  if (cpfLimit) return cpfLimit

  if (ensureServiceRoleConfig()) return suporte()

  const { data: pessoa } = await supabaseAdmin
    .from('profiles')
    .select('role, ativo, condominium_id, condominio_id')
    .eq('cpf', cpf)
    .limit(1)
    .maybeSingle()

  const condominiumId = pessoa?.condominium_id || pessoa?.condominio_id
  if (!pessoa || pessoa.ativo === false || !condominiumId || !MORADORES.includes(String(pessoa.role || '').toLowerCase())) {
    return suporte()
  }

  const { data: condominio } = await supabaseAdmin
    .from('condominiums')
    .select('whatsapp, status')
    .eq('id', condominiumId)
    .maybeSingle()

  const whatsapp = condominio?.status === 'active' ? normalizarWhatsapp(condominio.whatsapp) : ''
  return whatsapp ? json({ destino: 'sindico', whatsapp }) : suporte()
}
