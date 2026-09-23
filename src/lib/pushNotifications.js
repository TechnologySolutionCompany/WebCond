// Notificacoes no aparelho (Web Push): cada navegador/celular onde a pessoa entrou e aceitou
// recebe avisos e cobrancas mesmo com o WebCond fechado.
// iPhone/iPad: so funciona com o WebCond instalado na tela inicial (iOS 16.4 ou mais novo).
import { supabase } from './supabase'

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
const SW_PATH = '/sw.js'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

function isIos() {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// Nome curto do aparelho para a pessoa reconhecer na lista ("Chrome no Android").
export function describeDevice() {
  const ua = navigator.userAgent || ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const system = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'computador'
  return `${browser} no ${system}`
}

// Situacao deste aparelho: o que da para fazer e o que dizer para a pessoa.
export function getPushSupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'unsupported' }
  if (!PUBLIC_KEY) return { supported: false, reason: 'not-configured' }
  if (isIos() && !isStandalone()) return { supported: false, reason: 'ios-install' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: 'unsupported' }
  }
  if (Notification.permission === 'denied') return { supported: false, reason: 'denied' }
  return { supported: true, reason: '' }
}

export const PUSH_REASON_TEXT = {
  'not-configured': 'As notificacoes no aparelho ainda nao foram ligadas no servidor.',
  'ios-install': 'No iPhone/iPad: toque em Compartilhar > "Adicionar a Tela de Inicio", abra o WebCond pelo icone e ative aqui.',
  unsupported: 'Este navegador nao recebe notificacoes. Use Chrome, Edge, Firefox ou Safari atualizado.',
  denied: 'As notificacoes do WebCond estao bloqueadas neste navegador. Libere nas configuracoes do site (cadeado ao lado do endereco) e tente de novo.',
}

async function getRegistration() {
  // Em desenvolvimento o service worker nao e registrado no carregamento: registra aqui.
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  await navigator.serviceWorker.register(SW_PATH)
  return navigator.serviceWorker.ready
}

export async function getCurrentSubscription() {
  if (!getPushSupport().supported) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

async function callTenant(path, payload) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessao expirada. Entre novamente.')
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Nao foi possivel concluir agora.')
  return result
}

export async function enablePush() {
  const support = getPushSupport()
  if (!support.supported) throw new Error(PUSH_REASON_TEXT[support.reason])

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(PUSH_REASON_TEXT.denied)

  const registration = await getRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
    })
  }

  await callTenant('/api/tenant/push-subscribe', { subscription: subscription.toJSON(), dispositivo: describeDevice() })
  return subscription
}

export async function disablePush() {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe().catch(() => {})
  await callTenant('/api/tenant/push-unsubscribe', { endpoint })
}

// Depois do login: se o navegador ja tem notificacoes ligadas, confirma o aparelho para quem entrou.
export async function syncPushOwner() {
  try {
    if (!getPushSupport().supported || Notification.permission !== 'granted') return
    const subscription = await getCurrentSubscription()
    if (!subscription) return
    await callTenant('/api/tenant/push-subscribe', { subscription: subscription.toJSON(), dispositivo: describeDevice() })
  } catch {
    // informativo: nunca atrapalha o login
  }
}

// Ao clicar em Sair: este aparelho para de receber notificacoes da conta que saiu.
// Nunca trava o logout (falha silenciosa, tempo maximo curto).
export async function detachPushOnSignOut() {
  try {
    const subscription = await Promise.race([
      getCurrentSubscription(),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ])
    if (!subscription) return
    const { endpoint } = subscription
    await Promise.race([
      callTenant('/api/tenant/push-unsubscribe', { endpoint }).catch(() => {}),
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ])
    await subscription.unsubscribe().catch(() => {})
  } catch {
    // nada a fazer: o logout continua
  }
}
