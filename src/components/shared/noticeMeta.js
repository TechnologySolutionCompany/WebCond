import { Bell, Info, TriangleAlert, Wrench } from 'lucide-react'

// Tipos de aviso e categorias de documento no formato do prototipo (redesign v2.10A3),
// usados pelo morador e pelo sindico.
export const AVISO_TIPOS = {
  informativo: { label: 'Informativo', plural: 'Informativos', icon: Info, tone: 'primary' },
  aviso: { label: 'Aviso', plural: 'Avisos', icon: Bell, tone: 'amber' },
  urgente: { label: 'Urgente', plural: 'Urgentes', icon: TriangleAlert, tone: 'red' },
  manutencao: { label: 'Manutenção', plural: 'Manutenção', icon: Wrench, tone: 'neutral' },
}

export const DOC_CATEGORIAS = {
  ata: 'Ata',
  regimento: 'Regimento',
  contrato: 'Contrato',
  financeiro: 'Financeiro',
  comprovante: 'Comprovante',
  conta: 'Conta',
  boleto: 'Boleto',
  outro: 'Outro',
}

// "Hoje", "Ontem" ou dd/mm.
export function formatNoticeDate(value) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Extensao do arquivo para o selo do cartao (PDF, DOCX, JPG...).
export function fileExtension(name = '') {
  const match = String(name).split('?')[0].match(/\.([a-z0-9]{2,5})$/i)
  return match ? match[1].toUpperCase() : 'ARQ'
}
