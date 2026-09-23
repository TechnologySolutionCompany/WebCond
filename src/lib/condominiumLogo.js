// Endereco publico da logo do condominio. O bucket "condominios" e de leitura publica
// (e uma marca visual, nao um dado pessoal) e so a administracao da plataforma grava nele.
// Sem logo cadastrada, quem chama usa a marca do WebCond no lugar.
import { supabase } from './supabase'

export function condominiumLogoUrl(logoPath) {
  const caminho = String(logoPath || '').trim()
  if (!caminho) return ''

  return supabase.storage.from('condominios').getPublicUrl(caminho).data?.publicUrl || ''
}

// A marca que aparece no topo do painel: a do condominio, quando existir, senao a do WebCond.
export function painelLogoUrl(logoPath) {
  return condominiumLogoUrl(logoPath) || '/logo.svg'
}
