// Dados da fatura condominial (v1.09A5) no formato de fatura/fatura-exemplo.json, que alimenta
// o template Handlebars api/_lib/fatura/fatura-template.html. Funcoes puras: sem banco, sem rede.
//
// O grafico dos ultimos 3 meses e a lista de unidades em aberto saem das cobrancas gravadas:
// "pago" e o que foi confirmado (pelo banco, na baixa automatica, ou pelo sindico).
import { formatCurrency, formatDateLabel, formatReferenceLabel } from './billingShared.js'
import { getChargePaymentStatus } from './chargeStatus.js'

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
// Altura da coluna do grafico no template (.mes .coluna { height: 96px }).
export const ALTURA_COLUNA_PX = 96

function referenciaValida(referencia) {
  const match = String(referencia || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const mes = Number(match[2])
  return mes >= 1 && mes <= 12 ? { ano: Number(match[1]), mes } : null
}

// "2026-09" -> ["2026-06", "2026-07", "2026-08"]: os 3 meses ANTES da fatura.
export function mesesAnteriores(referencia, quantidade = 3) {
  const base = referenciaValida(referencia)
  if (!base) return []
  const lista = []
  for (let passo = quantidade; passo >= 1; passo -= 1) {
    const indice = base.ano * 12 + (base.mes - 1) - passo
    lista.push(`${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`)
  }
  return lista
}

function unidadeDa(cobranca) {
  return String(cobranca?.unidade_numero || '').trim()
}

// Situacao de cada unidade no mes: paga (tudo pago), inadimplente (algo vencido) ou nao paga.
export function calcularHistorico(cobrancas, referencia, hoje = new Date()) {
  return mesesAnteriores(referencia).map((mes) => {
    const porUnidade = new Map()
    for (const cobranca of cobrancas || []) {
      if (cobranca?.mes_referencia !== mes || !unidadeDa(cobranca)) continue
      const status = getChargePaymentStatus(cobranca, hoje)
      if (status === 'CANCELLED') continue
      const lista = porUnidade.get(unidadeDa(cobranca)) || []
      lista.push(status)
      porUnidade.set(unidadeDa(cobranca), lista)
    }

    let pagas = 0
    let inadimplentes = 0
    for (const statuses of porUnidade.values()) {
      if (statuses.every((status) => status === 'PAID')) pagas += 1
      else if (statuses.includes('OVERDUE')) inadimplentes += 1
    }
    const total = porUnidade.size
    const naoPagas = total - pagas - inadimplentes
    const px = (quantidade) => (total ? Math.round((quantidade / total) * ALTURA_COLUNA_PX) : 0)

    return {
      mes: MESES[Number(mes.slice(5)) - 1],
      referencia: mes,
      total,
      pagas,
      px_inadimplente: px(inadimplentes),
      px_nao_pago: px(naoPagas),
      px_pago: px(pagas),
    }
  })
}

// Unidades com cobranca vencida (inadimplentes), em ordem numerica.
export function unidadesEmAberto(cobrancas, hoje = new Date()) {
  const unidades = new Set()
  for (const cobranca of cobrancas || []) {
    if (unidadeDa(cobranca) && getChargePaymentStatus(cobranca, hoje) === 'OVERDUE') unidades.add(unidadeDa(cobranca))
  }
  return [...unidades].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
}

// "2026-09" + unidade "202" -> "2026-09-0202" (mesmo formato do exemplo da TSCBr).
export function numeroDaFatura(referencia, unidade) {
  const digitos = String(unidade || '').replace(/\D/g, '')
  const sufixo = digitos ? digitos.padStart(4, '0').slice(-4) : String(unidade || '0000').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()
  return `${referencia || 'SEM-REF'}-${sufixo}`
}

function hojeBr(data = new Date()) {
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`
}

// Rotulo do tipo de chave para a fatura ("Chave Pix (e-mail)").
const ROTULO_CHAVE = { email: 'e-mail', telefone: 'celular', cpf: 'CPF', cnpj: 'CNPJ', aleatoria: 'chave aleatoria' }

// Monta o JSON da fatura. Valores em numero; aqui viram texto ja formatado (o template so imprime).
export function montarDadosFatura({
  condominio,
  morador,
  referencia,
  vencimento,
  itens,
  cobrancasDoCondominio = [],
  mostrarUnidadesAbertas = true,
  pagamento = {},
  emissao = new Date(),
}) {
  const total = (itens || []).reduce((soma, item) => soma + Number(item.valor || 0), 0)
  const referenciaRotulo = formatReferenceLabel(referencia)

  return {
    condominio: {
      nome: condominio?.nome || 'Condominio',
      endereco: condominio?.endereco || '',
      cnpj: condominio?.cnpj || '',
      logo_url: condominio?.logo_url || '',
    },
    fatura: {
      numero: numeroDaFatura(referencia, morador?.unidade),
      emissao: hojeBr(emissao),
      referencia: referenciaRotulo,
      vencimento: formatDateLabel(vencimento),
      subtotal: formatCurrency(total),
      total: formatCurrency(total),
    },
    morador: {
      nome: morador?.nome || 'Morador(a)',
      contato: morador?.contato || '',
      unidade: morador?.unidade ? `APTO ${morador.unidade}` : '-',
      bloco: morador?.bloco || 'Bloco unico',
      obs: morador?.obs || 'N/A',
    },
    itens: (itens || [])
      .filter((item) => Number(item.valor || 0) > 0)
      .map((item) => ({
        titulo: item.titulo || 'Item',
        descricao: item.descricao || '',
        tipo: String(item.tipo || 'TAXA').toUpperCase(),
        origem: item.origem || '',
        valor: formatCurrency(item.valor),
      })),
    historico: calcularHistorico(cobrancasDoCondominio, referencia, emissao),
    unidades_abertas: mostrarUnidadesAbertas ? unidadesEmAberto(cobrancasDoCondominio, emissao) : [],
    pagamento: {
      pix_chave: pagamento.chave || '',
      pix_rotulo: ROTULO_CHAVE[pagamento.tipoChave] || 'chave',
      pix_copia_cola: pagamento.copiaECola || '',
      qrcode_url: pagamento.qrcode || '',
      link: pagamento.link || '',
      banco: pagamento.banco || '',
      instrucoes: pagamento.instrucoes || 'Apos a data de vencimento, o pagamento fica disponivel no proximo mes.',
    },
  }
}
