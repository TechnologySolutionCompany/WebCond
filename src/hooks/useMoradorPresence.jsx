import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isResidentRole, normalizeRole } from '../lib/auth'

const CHANNEL_NAME = 'webcond-online-moradores'

function mapPresence(channel) {
  const state = channel.presenceState()
  const residents = Object.values(state)
    .flat()
    .filter((entry) => isResidentRole(entry?.role))

  const uniqueResidents = new Map()
  residents.forEach((resident) => {
    if (!resident?.id) return
    uniqueResidents.set(resident.id, resident)
  })

  return Array.from(uniqueResidents.values())
}

export function useMoradorPresence(profile, shouldTrack = false) {
  const [onlineMoradores, setOnlineMoradores] = useState([])

  useEffect(() => {
    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: profile?.id || `guest-${Date.now()}` } },
    })

    const syncPresence = () => {
      setOnlineMoradores(mapPresence(channel))
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return

        if (shouldTrack && profile?.id) {
          await channel.track({
            id: profile.id,
            nome: profile.nome,
            apartamento: profile.apartamento,
            role: normalizeRole(profile.role),
            onlineAt: new Date().toISOString(),
          })
        }
      })

    return () => {
      if (shouldTrack && profile?.id) {
        void channel.untrack()
      }

      void supabase.removeChannel(channel)
    }
  }, [profile?.id, profile?.nome, profile?.apartamento, profile?.role, shouldTrack])

  const totalOnline = useMemo(() => onlineMoradores.length, [onlineMoradores])

  return {
    onlineMoradores,
    totalOnline,
  }
}
