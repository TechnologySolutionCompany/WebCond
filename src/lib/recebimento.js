// Como cada condominio recebe (v1.09A5). Uma regra so, lida pela tela do sindico e pelo servidor.
//
// O boleto (fatura) e sempre o mesmo modelo do WebCond. O que muda por condominio e o banco:
//   pix_direto  -> qualquer banco. A fatura sai com o QR Code Pix da chave do condominio.
//                  O morador paga e avisa; o sindico confere no extrato e da baixa.
//   infinitepay -> a cobranca ganha tambem um link "Pagar agora" (Pix ou cartao) da InfinitePay
//                  do condominio. Quando o banco confirma, a baixa e automatica.
// Outros bancos com API (Asaas, Mercado Pago...) entram aqui como novos provedores, sem mexer
// no boleto nem nas telas: ver docs/pagamentos-e-bancos.md.
export const PROVEDORES_RECEBIMENTO = {
  pix_direto: {
    id: 'pix_direto',
    label: 'Pix direto na conta do condominio',
    resumo: 'Funciona com qualquer banco. A fatura sai com o QR Code da sua chave Pix; a baixa e confirmada por voce.',
    baixaAutomatica: false,
  },
  infinitepay: {
    id: 'infinitepay',
    label: 'InfinitePay (link de pagamento com baixa automatica)',
    resumo: 'Cada cobranca ganha um link "Pagar agora" (Pix ou cartao). O dinheiro cai na conta InfinitePay do condominio e a cobranca vira paga sozinha.',
    baixaAutomatica: true,
  },
}

export const PROVEDOR_PADRAO = 'pix_direto'

// InfiniteTag e o "@" da conta InfinitePay, sem o cifrao: "$condominioeco" -> "condominioeco".
export function normalizarInfiniteTag(valor) {
  return String(valor || '').trim().replace(/^\$+/, '').replace(/^@+/, '').toLowerCase()
}

export function infiniteTagValida(valor) {
  return /^[a-z0-9][a-z0-9._-]{1,39}$/.test(normalizarInfiniteTag(valor))
}

// metadata.recebimento do condominio -> configuracao com valores padrao.
export function lerRecebimento(metadata) {
  const bruto = metadata && typeof metadata === 'object' && metadata.recebimento && typeof metadata.recebimento === 'object'
    ? metadata.recebimento
    : {}
  const provedor = PROVEDORES_RECEBIMENTO[bruto.provedor] ? bruto.provedor : PROVEDOR_PADRAO
  return {
    provedor,
    infinitepayTag: normalizarInfiniteTag(bruto.infinitepay_tag),
    // Lista de unidades em aberto na fatura: o sindico decide (ver o aviso na tela de Recebimento).
    mostrarUnidadesAbertas: bruto.mostrar_unidades_abertas !== false,
    instrucoes: String(bruto.instrucoes || '').trim().slice(0, 240),
  }
}

// Provedor efetivo: InfinitePay sem InfiniteTag valida cai no Pix direto (nunca gera link quebrado).
export function provedorEfetivo(config) {
  if (config?.provedor === 'infinitepay' && infiniteTagValida(config.infinitepayTag)) return 'infinitepay'
  return 'pix_direto'
}
