// Avisos sao apagados automaticamente 30 dias apos o envio (funcao purge_expired_avisos no banco).
export const NOTICE_RETENTION_DAYS = 30

export function noticeDaysLeft(aviso, now = new Date()) {
  const createdAt = new Date(aviso?.created_at)
  if (Number.isNaN(createdAt.getTime())) return NOTICE_RETENTION_DAYS
  const expiresAt = createdAt.getTime() + NOTICE_RETENTION_DAYS * 86400000
  return Math.max(0, Math.ceil((expiresAt - now.getTime()) / 86400000))
}

// Esconde avisos vencidos mesmo antes da limpeza do banco rodar.
export function isNoticeCurrent(aviso, now = new Date()) {
  return noticeDaysLeft(aviso, now) > 0
}
