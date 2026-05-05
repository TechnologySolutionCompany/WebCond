import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveCondominiumSettings } from '../lib/condominium'

const initialState = {
  loading: true,
  condominium: null,
  error: '',
}

export function useCondominiumSettings(condominiumId) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      if (!condominiumId) {
        if (!isMounted) return
        setState({ loading: false, condominium: null, error: '' })
        return
      }

      try {
        const { data, error } = await supabase
          .from('condominiums')
          .select('id, name, nome, address, endereco, pix_key, chave_pix, whatsapp, unit_count, bank_details, metadata')
          .eq('id', condominiumId)
          .maybeSingle()

        if (!isMounted) return
        if (error) throw error

        setState({
          loading: false,
          condominium: data || null,
          error: '',
        })
      } catch (error) {
        if (!isMounted) return

        setState({
          loading: false,
          condominium: null,
          error: error.message || 'Nao foi possivel carregar os dados do condominio.',
        })
      }
    }

    setState((current) => ({ ...current, loading: true, error: '' }))
    void load()

    return () => {
      isMounted = false
    }
  }, [condominiumId])

  const settings = useMemo(
    () => resolveCondominiumSettings(state.condominium),
    [state.condominium],
  )

  return {
    ...state,
    settings,
  }
}
