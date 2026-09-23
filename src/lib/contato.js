// Contato da TSCBr usado na tela inicial, no rodape e na tela de planos.
export const TSC_WHATSAPP = '5581997243724'
export const MSG_INFORMACOES = 'Ola, queria mais informacoes sobre o WebCond'
export const MSG_PLANOS = 'Ola, gostaria de tirar algumas duvidas sobre os planos da TSCBr.'

export function whatsappUrl(message = MSG_INFORMACOES) {
  return `https://wa.me/${TSC_WHATSAPP}?text=${encodeURIComponent(message)}`
}

// Interesse em um plano: a mensagem ja chega dizendo o plano e o condominio.
export function whatsappPlanoUrl(planLabel, condominiumName = '') {
  const onde = condominiumName ? ` Sou responsavel pelo condominio ${condominiumName}.` : ''
  return whatsappUrl(`Ola, tenho interesse no plano ${planLabel} do WebCond.${onde}`)
}
