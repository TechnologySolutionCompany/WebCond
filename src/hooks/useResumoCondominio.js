import { useCallback, useEffect, useState } from 'react'
import { getTenantChargeSummary } from '../lib/tenantApi'

// Atualiza sozinho enquanto a tela esta aberta (o morador nao le as cobrancas dos outros:
// o servidor manda so os totais).
export const RESUMO_REFRESH_MS = 60000

// Busca o resumo agora e de novo a cada minuto, so com a tela ativa e o app em primeiro plano.
export function useResumoCondominio(isActive) {
  const [resumo, setResumo] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      setResumo(await getTenantChargeSummary())
      setErro('')
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o resumo do condomínio.')
    }
  }, [])

  useEffect(() => {
    if (!isActive) return undefined
    void carregar()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, RESUMO_REFRESH_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void carregar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [isActive, carregar])

  return { resumo, erro, recarregar: carregar }
}
