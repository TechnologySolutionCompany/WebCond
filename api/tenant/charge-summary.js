import { json, requireAuthenticatedProfile, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getChargeStatus } from '../../src/lib/chargeStatus.js'

export async function GET(req) {
  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const condominiumId = auth.profile?.condominium_id
  if (!condominiumId) {
    return json({ error: 'Condominio nao encontrado para o usuario autenticado.' }, 403)
  }

  const [{ data: moradores, error: moradoresError }, { data: cobrancas, error: cobrancasError }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, apartamento')
      .in('role', ['morador', 'RESIDENT'])
      .eq('ativo', true)
      .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`),
    supabaseAdmin
      .from('cobrancas')
      .select('id, morador_id, pago, payment_status, vencimento, created_at, mes_referencia')
      .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`),
  ])

  if (moradoresError || cobrancasError) {
    return json({ error: 'Nao foi possivel montar o resumo do condominio.' }, 500)
  }

  const apartmentByResidentId = new Map()
  const apartmentStatus = new Map()

  for (const morador of moradores || []) {
    const apartment = String(morador.apartamento || '').trim()
    if (!apartment) continue

    apartmentByResidentId.set(morador.id, apartment)
    if (!apartmentStatus.has(apartment)) {
      apartmentStatus.set(apartment, 'sem_cobranca')
    }
  }

  for (const charge of cobrancas || []) {
    const apartment = apartmentByResidentId.get(charge.morador_id)
    if (!apartment) continue

    const nextStatus = getChargeStatus(charge)
    const currentStatus = apartmentStatus.get(apartment) || 'em_aberto'

    if (nextStatus === 'inadimplente') {
      apartmentStatus.set(apartment, 'inadimplente')
      continue
    }

    if (nextStatus === 'em_aberto' && currentStatus !== 'inadimplente') {
      apartmentStatus.set(apartment, 'em_aberto')
      continue
    }

    if (nextStatus === 'pago' && currentStatus === 'sem_cobranca') {
      apartmentStatus.set(apartment, 'pago')
    }
  }

  const summary = {
    em_aberto: 0,
    pago: 0,
    inadimplente: 0,
  }

  for (const status of apartmentStatus.values()) {
    if (status === 'sem_cobranca') {
      summary.em_aberto += 1
      continue
    }

    summary[status] += 1
  }

  return json({
    total_apartamentos: apartmentStatus.size,
    ...summary,
  })
}
