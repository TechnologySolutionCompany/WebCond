import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabaseAdmin.js'

// O token e a unica ligacao entre quem preenche o formulario e o condominio.
// Quem abre o link nunca escolhe, digita ou ve o id do condominio: o servidor resolve
// token -> condominio. E por isso que um cadastro nao tem como cair no condominio errado.
export const INVITE_TTL_DAYS = 30

export function generateInviteToken() {
  return randomBytes(24).toString('base64url')
}

export function isInviteExpired(invite) {
  if (!invite?.expira_em) return false
  return new Date(invite.expira_em).getTime() <= Date.now()
}

// Descreve o link para a tela do sindico, sem expor nada de outro condominio.
// Devolve o token, nao a URL: quem monta o endereco e o navegador, com a propria origem,
// para o cabecalho Host da requisicao nunca decidir para onde o link aponta.
export function describeInvite(invite) {
  if (!invite) return null
  return {
    id: invite.id,
    token: invite.token,
    criadoEm: invite.created_at,
    expiraEm: invite.expira_em,
    expirado: isInviteExpired(invite),
    usos: invite.usos || 0,
  }
}

export async function getActiveInvite(condominiumId) {
  const { data, error } = await supabaseAdmin
    .from('condominio_convites')
    .select('id, token, ativo, expira_em, usos, created_at')
    .eq('condominium_id', condominiumId)
    .eq('ativo', true)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel consultar o link de cadastro.')
  return data || null
}

// Gerar de novo invalida o anterior: um link ativo por condominio.
export async function rotateInvite(condominiumId, createdBy) {
  const { error: deactivateError } = await supabaseAdmin
    .from('condominio_convites')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('condominium_id', condominiumId)
    .eq('ativo', true)

  if (deactivateError) throw new Error('Nao foi possivel desativar o link anterior.')

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('condominio_convites')
    .insert({
      condominium_id: condominiumId,
      created_by: createdBy || null,
      token: generateInviteToken(),
      ativo: true,
      expira_em: expiresAt,
    })
    .select('id, token, ativo, expira_em, usos, created_at')
    .single()

  if (error || !data) throw new Error('Nao foi possivel gerar o link de cadastro.')
  return data
}

export async function revokeInvite(condominiumId) {
  const { error } = await supabaseAdmin
    .from('condominio_convites')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('condominium_id', condominiumId)
    .eq('ativo', true)

  if (error) throw new Error('Nao foi possivel desativar o link de cadastro.')
}

// Token -> condominio. Devolve sempre o mesmo motivo generico para quem esta de fora,
// para o formulario publico nao virar uma forma de descobrir tokens validos.
export async function resolveInvite(token) {
  const normalized = String(token || '').trim()
  if (!normalized || normalized.length > 128) return { error: 'LINK_INVALIDO' }

  const { data: invite, error } = await supabaseAdmin
    .from('condominio_convites')
    .select('id, condominium_id, ativo, expira_em, usos')
    .eq('token', normalized)
    .maybeSingle()

  if (error) return { error: 'FALHA' }
  if (!invite || !invite.ativo) return { error: 'LINK_INVALIDO' }
  if (isInviteExpired(invite)) return { error: 'LINK_EXPIRADO' }

  const { data: condominium, error: condominiumError } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, status, metadata, created_at, updated_at')
    .eq('id', invite.condominium_id)
    .maybeSingle()

  if (condominiumError || !condominium) return { error: 'LINK_INVALIDO' }

  return { invite, condominium }
}

export async function registerInviteUse(inviteId, currentUses) {
  await supabaseAdmin
    .from('condominio_convites')
    .update({ usos: Number(currentUses || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', inviteId)
}
