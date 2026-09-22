// Chamados de suporte (sindico -> plataforma): status e limites dos anexos.
export const SUPORTE_TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const SUPORTE_MAX_BYTES = 5 * 1024 * 1024
export const SUPORTE_MAX_ANEXOS = 5

export const STATUS_SUPORTE = {
  aberto: { label: 'Aberto', badge: 'badge-orange' },
  em_andamento: { label: 'Em andamento', badge: 'badge-blue' },
  resolvido: { label: 'Resolvido', badge: 'badge-green' },
}
