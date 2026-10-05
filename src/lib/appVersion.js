// Versao exibida no app. Padrao interno da TSCBr:
//   v<tipo>.<mes>A<ajuste>
//   tipo:   1 = estrutural, 2 = layout, 3 = correcao de erro
//   mes:    mes da atualizacao, com dois digitos (09 = setembro)
//   ajuste: quantas vezes aquela versao ja foi ajustada
// Exemplo: v1.09A2 = atualizacao estrutural de setembro, segundo ajuste.
//
// A fonte unica e o "version" do package.json, no formato semver <tipo>.<mes>.<ajuste>
// (1.9.2 -> v1.09A2). Mude so la; tudo o que mostra a versao le daqui.
//
// O "releaseDate" (AAAA-MM-DD) do package.json e a data da atualizacao. Ele alimenta a "Ultima
// atualizacao" das paginas legais: a cada versao nova, troque a versao E a data no package.json.
import packageJson from '../../package.json' with { type: 'json' }

const TIPOS = { 1: 'Estrutural', 2: 'Layout', 3: 'Correcao' }

export function formatAppVersion(semver = '') {
  const [tipo, mes, ajuste] = String(semver).split('.').map((part) => Number.parseInt(part, 10))
  if (![tipo, mes, ajuste].every(Number.isFinite)) return 'v?'
  return `v${tipo}.${String(mes).padStart(2, '0')}A${ajuste}`
}

export function describeAppVersion(semver = '') {
  const [tipo, mes, ajuste] = String(semver).split('.').map((part) => Number.parseInt(part, 10))
  return {
    label: formatAppVersion(semver),
    tipo: TIPOS[tipo] || 'Desconhecido',
    mes: String(mes).padStart(2, '0'),
    ajuste,
  }
}

export const APP_VERSION = formatAppVersion(packageJson.version)
export const APP_VERSION_INFO = describeAppVersion(packageJson.version)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// "2026-10-05" -> "5 de outubro de 2026". Data invalida -> ''.
export function formatReleaseDate(iso = '') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
  if (!match) return ''
  const [, ano, mes, dia] = match.map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return ''
  return `${dia} de ${MESES[mes - 1]} de ${ano}`
}

export const APP_RELEASE_DATE = packageJson.releaseDate || ''
export const APP_RELEASE_DATE_LABEL = formatReleaseDate(APP_RELEASE_DATE)
