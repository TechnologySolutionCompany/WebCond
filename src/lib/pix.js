// Pix "copia e cola" no padrao oficial do Banco Central (BR Code / EMV-QRCPS), v1.09A5.
//
// Ate a v1.09A4 o boleto levava um texto "PIX|chave|valor|ref", que nenhum app de banco le.
// Este e o formato que todo banco aceita: o QR Code ja abre com a chave do condominio, o valor
// e a identificacao da cobranca preenchidos. Funciona com a chave de QUALQUER banco (Nubank,
// Caixa, InfinitePay, Inter...), sem integracao nenhuma: e por isso que o boleto padronizado
// do WebCond vale para todos os condominios, cada um com a sua chave.
//
// Limite honesto: Pix estatico nao avisa o WebCond que foi pago. A baixa automatica so existe
// com a integracao do banco (InfinitePay, ver api/_lib/pagamentos).

const GUI_PIX = 'br.gov.bcb.pix'

function campo(id, valor) {
  const texto = String(valor)
  return `${id}${String(texto.length).padStart(2, '0')}${texto}`
}

// CRC16-CCITT (polinomio 0x1021, inicio 0xFFFF), exigido pelo campo 63.
export function crc16(texto) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Nome e cidade no QR: so letras sem acento, numeros e espaco (alguns bancos recusam o resto).
function textoSimples(valor, max) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim()
}

function cpfValido(digitos) {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false
  const dv = (base) => {
    const soma = [...base].reduce((total, numero, indice) => total + Number(numero) * (base.length + 1 - indice), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(digitos.slice(0, 9)) === Number(digitos[9]) && dv(digitos.slice(0, 10)) === Number(digitos[10])
}

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A chave e digitada livre pelo sindico ("(81) 99999-0000", "000.000.000-00", e-mail...).
// O Pix exige o formato canonico de cada tipo. Devolve { tipo, chave } ou null.
export function normalizarChavePix(entrada) {
  const bruto = String(entrada || '').trim()
  if (!bruto) return null
  if (bruto.includes('@')) {
    const email = bruto.toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 77 ? { tipo: 'email', chave: email } : null
  }
  if (EVP.test(bruto)) return { tipo: 'aleatoria', chave: bruto.toLowerCase() }

  const digitos = bruto.replace(/\D/g, '')
  if (bruto.startsWith('+')) return digitos.length >= 12 && digitos.length <= 13 ? { tipo: 'telefone', chave: `+${digitos}` } : null
  if (digitos.length === 14) return { tipo: 'cnpj', chave: digitos }
  // 11 digitos: CPF se o digito verificador fecha e nao foi escrito como telefone; senao, celular.
  if (digitos.length === 11 && cpfValido(digitos) && !/[()]/.test(bruto)) return { tipo: 'cpf', chave: digitos }
  if (digitos.length === 10 || digitos.length === 11) return { tipo: 'telefone', chave: `+55${digitos}` }
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return { tipo: 'telefone', chave: `+${digitos}` }
  return null
}

// Identificador da cobranca (txid): ate 25 letras/numeros. Aparece no extrato do condominio.
export function txidDaCobranca(texto) {
  const limpo = String(texto || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)
  return limpo || '***'
}

// Monta o "copia e cola". Retorna '' quando a chave nao e valida (o boleto entao mostra so a chave).
export function montarPixCopiaECola({ chave, valor, nome, cidade, txid, descricao = '' }) {
  const chaveNormalizada = normalizarChavePix(chave)
  if (!chaveNormalizada) return ''

  const valorNumero = Number(valor || 0)
  const infoAdicional = textoSimples(descricao, 40)
  let contaPix = campo('00', GUI_PIX) + campo('01', chaveNormalizada.chave)
  // O campo 26 inteiro tem no maximo 99 caracteres: a descricao so entra se couber.
  if (infoAdicional && contaPix.length + 4 + infoAdicional.length <= 99) contaPix += campo('02', infoAdicional)

  const corpo = [
    campo('00', '01'),
    campo('26', contaPix),
    campo('52', '0000'),
    campo('53', '986'),
    valorNumero > 0 ? campo('54', valorNumero.toFixed(2)) : '',
    campo('58', 'BR'),
    campo('59', textoSimples(nome, 25) || 'CONDOMINIO'),
    campo('60', textoSimples(cidade, 15) || 'BRASIL'),
    campo('62', campo('05', txidDaCobranca(txid))),
    '6304',
  ].join('')

  return corpo + crc16(corpo)
}

// Leitura do BR Code (usada nos testes e para conferir um codigo colado pelo sindico).
export function lerPixCopiaECola(codigo) {
  const texto = String(codigo || '').trim()
  if (texto.length < 8 || crc16(texto.slice(0, -4)) !== texto.slice(-4).toUpperCase()) return null
  const lerCampos = (trecho) => {
    const campos = {}
    let posicao = 0
    while (posicao + 4 <= trecho.length) {
      const id = trecho.slice(posicao, posicao + 2)
      const tamanho = Number(trecho.slice(posicao + 2, posicao + 4))
      if (!Number.isFinite(tamanho)) return null
      campos[id] = trecho.slice(posicao + 4, posicao + 4 + tamanho)
      posicao += 4 + tamanho
    }
    return campos
  }
  const campos = lerCampos(texto)
  if (!campos) return null
  const conta = lerCampos(campos['26'] || '') || {}
  const adicional = lerCampos(campos['62'] || '') || {}
  return {
    chave: conta['01'] || '',
    descricao: conta['02'] || '',
    valor: campos['54'] ? Number(campos['54']) : 0,
    nome: campos['59'] || '',
    cidade: campos['60'] || '',
    txid: adicional['05'] || '',
  }
}
