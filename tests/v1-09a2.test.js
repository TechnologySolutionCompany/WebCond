// Regras novas da v1.09A2: versao do app, presenca do sindico, sessao de 5 minutos e historico do status.
import assert from 'node:assert/strict'
import test from 'node:test'
import { APP_VERSION, describeAppVersion, formatAppVersion } from '../src/lib/appVersion.js'
import { formatElapsed, getPresence, OFFLINE_AFTER_DAYS, ONLINE_WINDOW_MS } from '../src/lib/presence.js'
import { AWAY_LOGOUT_MS, isAwayTooLong, markActivity, readLastActivity } from '../src/lib/sessionActivity.js'
import { loadStatusHistory, pruneHistory, saveStatusHistory, STATUS_HISTORY_MAX_ITEMS, STATUS_REFRESH_MS } from '../src/lib/statusHistory.js'

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const NOW = Date.parse('2026-09-21T12:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

function memoryStorage() {
  const data = new Map()
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}

test('versao segue o padrao v<tipo>.<mes>A<ajuste>', () => {
  assert.equal(APP_VERSION, 'v1.09A4')
  assert.equal(formatAppVersion('1.9.2'), 'v1.09A2')
  assert.equal(formatAppVersion('2.10.8'), 'v2.10A8')
  assert.equal(formatAppVersion('3.1.0'), 'v3.01A0')
  assert.equal(formatAppVersion('lixo'), 'v?')
  assert.deepEqual(describeAppVersion('1.9.2'), { label: 'v1.09A2', tipo: 'Estrutural', mes: '09', ajuste: 2 })
  assert.equal(describeAppVersion('2.9.1').tipo, 'Layout')
  assert.equal(describeAppVersion('3.9.1').tipo, 'Correcao')
})

test('presenca: sinal recente e online', () => {
  const presence = getPresence({ lastSeenAt: ago(40 * 1000) }, NOW)
  assert.equal(presence.key, 'online')
  assert.equal(presence.label, 'Online')
})

test('presenca: sem sinal ha mais de 3 minutos vira ausente', () => {
  assert.equal(getPresence({ lastSeenAt: ago(ONLINE_WINDOW_MS + 1000) }, NOW).key, 'ausente')
})

test('presenca: clicou em Sair depois do ultimo sinal vira ausente na hora', () => {
  const presence = getPresence({ lastSeenAt: ago(30 * 1000), leftAt: ago(10 * 1000) }, NOW)
  assert.equal(presence.key, 'ausente')
  assert.match(presence.detail, /Saiu do sistema ha 10 s/)
})

test('presenca: sinal novo depois de uma saida antiga volta a ser online', () => {
  assert.equal(getPresence({ lastSeenAt: ago(20 * 1000), leftAt: ago(2 * DAY) }, NOW).key, 'online')
})

test('presenca: 15 dias ou mais sem acessar e offline; nunca acessou tambem', () => {
  assert.equal(getPresence({ lastSeenAt: ago(OFFLINE_AFTER_DAYS * DAY) }, NOW).key, 'offline')
  assert.equal(getPresence({ lastSeenAt: ago((OFFLINE_AFTER_DAYS - 1) * DAY) }, NOW).key, 'ausente')
  assert.equal(getPresence({}, NOW).key, 'offline')
  assert.equal(getPresence({ lastSeenAt: 'data invalida' }, NOW).key, 'offline')
})

test('tempo decorrido em texto curto', () => {
  assert.equal(formatElapsed(45 * 1000), '45 s')
  assert.equal(formatElapsed(5 * MIN), '5 min')
  assert.equal(formatElapsed(3 * 60 * MIN), '3 h')
  assert.equal(formatElapsed(20 * DAY), '20 dias')
})

test('sessao: mais de 5 minutos fechado encerra; 5 minutos ou menos mantem', () => {
  assert.equal(AWAY_LOGOUT_MS, 5 * MIN)
  assert.equal(isAwayTooLong(NOW - 5 * MIN - 1, NOW), true)
  assert.equal(isAwayTooLong(NOW - 5 * MIN, NOW), false)
  assert.equal(isAwayTooLong(NOW - 30 * 1000, NOW), false)
  // Sem carimbo (primeiro acesso apos a atualizacao) nao derruba ninguem.
  assert.equal(isAwayTooLong(null, NOW), false)
})

test('sessao: o carimbo e gravado e lido do armazenamento do navegador', () => {
  const storage = memoryStorage()
  assert.equal(readLastActivity(storage), null)
  markActivity(NOW, storage)
  assert.equal(readLastActivity(storage), NOW)
  assert.equal(readLastActivity({ getItem: () => { throw new Error('bloqueado') } }), null)
})

test('status: atualiza a cada 15 s e guarda 24 h de historico', () => {
  assert.equal(STATUS_REFRESH_MS, 15000)
  const now = Date.now()
  const items = [
    { at: new Date(now - 25 * 60 * MIN).toISOString(), ms: 100, overall: 'ok' },
    { at: new Date(now - 60 * MIN).toISOString(), ms: 120, overall: 'degraded' },
    { at: new Date(now).toISOString(), ms: 90, overall: 'ok' },
  ]
  assert.deepEqual(pruneHistory(items, now).map((item) => item.ms), [120, 90])

  const storage = memoryStorage()
  saveStatusHistory(items, storage)
  assert.equal(loadStatusHistory(storage, now).length, 2, 'o historico sobrevive a sair e voltar')

  const many = Array.from({ length: STATUS_HISTORY_MAX_ITEMS + 50 }, (_, index) => ({ at: new Date(now - index * 1000).toISOString(), ms: 1, overall: 'ok' }))
  assert.equal(pruneHistory(many, now).length, STATUS_HISTORY_MAX_ITEMS)
  assert.deepEqual(loadStatusHistory({ getItem: () => '{nao e json' }, now), [])
})
