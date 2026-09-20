import { json, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

const EXPORTABLE_ROLES = new Set(['morador', 'resident', 'contador'])

// Dados cadastrais de um condominio para recadastro/importacao. Nao inclui senhas.
export async function GET(req) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const condominiumId = String(new URL(req.url).searchParams.get('id') || '').trim()
  if (!condominiumId) {
    return json({ error: 'Condominio invalido.' }, 400)
  }

  const [{ data: condominium, error: condominiumError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabaseAdmin
      .from('condominiums')
      .select('id, name, nome, cnpj, address, zip_code, whatsapp, unit_count, status, metadata')
      .eq('id', condominiumId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('nome, cpf, email, whatsapp, apartamento, role, ativo, data_entrada, vinculo')
      .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
      .order('apartamento', { ascending: true }),
  ])

  if (condominiumError || profilesError) {
    return json({ error: 'Nao foi possivel exportar os dados do condominio.' }, 500)
  }
  if (!condominium) {
    return json({ error: 'Condominio nao encontrado.' }, 404)
  }

  const residents = (profiles || [])
    .filter((profile) => EXPORTABLE_ROLES.has(String(profile.role || '').trim().toLowerCase()))
    .map((profile) => ({
      nome: profile.nome || '',
      cpf: profile.cpf || '',
      // E-mails internos de login sao regenerados na importacao.
      email: String(profile.email || '').endsWith('@login.webcond.local') ? '' : profile.email || '',
      whatsapp: profile.whatsapp || '',
      apartamento: profile.apartamento || '',
      perfil: String(profile.role || '').trim().toLowerCase() === 'contador' ? 'contador' : 'morador',
      vinculo: profile.vinculo || '',
      data_entrada: profile.data_entrada || '',
      ativo: profile.ativo !== false,
    }))

  return json({
    condominium: {
      name: condominium.name || condominium.nome || '',
      cnpj: condominium.cnpj || '',
      address: condominium.address || '',
      zip_code: condominium.zip_code || '',
      whatsapp: condominium.whatsapp || '',
      unit_count: Number(condominium.unit_count || 0),
      status: condominium.status || '',
    },
    residents,
    exported_at: new Date().toISOString(),
  })
}
