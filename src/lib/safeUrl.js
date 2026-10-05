// Links que vem do banco (link de pagamento, boleto, recibo, documento) so viram botao se forem
// http(s). Um "javascript:..." salvo no lugar do link nunca chega a ser aberto no aparelho de ninguem.
export function safeHttpUrl(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}
