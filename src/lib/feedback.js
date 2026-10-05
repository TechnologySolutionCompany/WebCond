// Feedback para a administracao da plataforma (v1.09A5). Mesmas categorias na tela e no servidor.
export const CATEGORIAS_FEEDBACK = [
  { key: 'sugestao', label: 'Sugestao' },
  { key: 'problema', label: 'Algo nao funcionou' },
  { key: 'elogio', label: 'Elogio' },
  { key: 'outro', label: 'Outro assunto' },
]

export const STATUS_FEEDBACK = {
  novo: { label: 'Novo', badge: 'badge-blue' },
  lido: { label: 'Lido', badge: 'badge-green' },
  arquivado: { label: 'Arquivado', badge: 'badge-purple' },
}

export function categoriaFeedbackLabel(key) {
  return CATEGORIAS_FEEDBACK.find((item) => item.key === key)?.label || 'Outro assunto'
}
