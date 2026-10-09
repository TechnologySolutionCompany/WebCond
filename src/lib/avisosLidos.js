import { NOTICE_RETENTION_DAYS } from './avisos.js'

// Avisos lidos e excluidos pelo morador (v2.10A4). O aviso aberto sai dos "Avisos recentes" do
// Inicio e continua em Avisos; o excluido some das duas telas. O aviso e do condominio todo (o
// sindico e quem apaga de verdade), entao "excluir" aqui e esconder so para esta pessoa.
//
// Fica neste aparelho (localStorage), separado por pessoa, como a ultima tela (lastView.js).
// O banco apaga o aviso em 30 dias; a marca dura um pouco mais e depois e descartada.
const PREFIX = 'webcond:avisos'
const KEEP_MS = (NOTICE_RETENTION_DAYS + 5) * 86400000

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function keyFor(ownerId) {
  return `${PREFIX}:${ownerId || 'anon'}`
}

function emptyState() {
  return { lidos: {}, excluidos: {} }
}

function prune(map, now) {
  const result = {}
  for (const [id, at] of Object.entries(map || {})) {
    if (Number.isFinite(at) && now - at <= KEEP_MS) result[id] = at
  }
  return result
}

export function readNoticeState(ownerId, { now = Date.now(), storage = browserStorage() } = {}) {
  try {
    const raw = storage?.getItem(keyFor(ownerId))
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyState()
    return { lidos: prune(parsed.lidos, now), excluidos: prune(parsed.excluidos, now) }
  } catch {
    return emptyState()
  }
}

function saveNoticeState(ownerId, state, storage) {
  try {
    storage?.setItem(keyFor(ownerId), JSON.stringify(state))
  } catch {
    // Sem armazenamento (aba anonima restrita): o aviso so volta a aparecer no Inicio.
  }
}

export function markNoticesRead(ownerId, ids = [], { now = Date.now(), storage = browserStorage() } = {}) {
  const state = readNoticeState(ownerId, { now, storage })
  let changed = false
  for (const id of ids) {
    if (id && !state.lidos[id]) {
      state.lidos[id] = now
      changed = true
    }
  }
  if (changed) saveNoticeState(ownerId, state, storage)
  return state
}

export function hideNotice(ownerId, id, { now = Date.now(), storage = browserStorage() } = {}) {
  const state = readNoticeState(ownerId, { now, storage })
  if (id) {
    state.excluidos[id] = now
    state.lidos[id] = state.lidos[id] || now
    saveNoticeState(ownerId, state, storage)
  }
  return state
}

export function isNoticeRead(state, aviso) {
  return Boolean(aviso?.id && state?.lidos?.[aviso.id])
}

export function isNoticeHidden(state, aviso) {
  return Boolean(aviso?.id && state?.excluidos?.[aviso.id])
}
