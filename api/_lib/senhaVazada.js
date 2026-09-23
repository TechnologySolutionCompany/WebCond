// Recusa de senha fraca ou vazada, feita pelo proprio WebCond.
//
// O Supabase tem essa verificacao pronta, mas so no plano Pro. Como o projeto esta no plano
// gratuito, a mesma protecao e feita aqui, com a mesma tecnica e o mesmo servico
// (HaveIBeenPwned) que o Supabase usaria.
//
// COMO A SENHA E PROTEGIDA NA CONSULTA (k-anonimato):
//   1. a senha vira um hash SHA-1 aqui dentro, no servidor;
//   2. so os 5 PRIMEIROS caracteres desse hash saem daqui;
//   3. o servico devolve todos os finais de hash que comecam com esses 5 caracteres
//      (algumas centenas) e a comparacao acontece de volta aqui.
// Ou seja: a senha nunca sai do servidor, nem inteira, nem em hash completo. Quem estiver
// olhando o trafego ve 5 caracteres que servem para milhares de senhas diferentes.
//
// A senha e o hash NUNCA aparecem em log, em mensagem de erro ou na resposta.
//
// SE O SERVICO ESTIVER FORA DO AR: a verificacao devolve "nao vazada" e o cadastro segue.
// Deixar uma pessoa sem conseguir se cadastrar porque um site de terceiro caiu seria pior do
// que aceitar uma senha que talvez estivesse em uma lista. A lista local (abaixo) continua
// valendo em qualquer situacao, porque nao depende de internet.

import { createHash } from 'node:crypto'

export const SENHA_VAZADA_AVISO = 'Esta senha aparece em vazamentos conhecidos ou e facil de adivinhar. Escolha outra senha.'

const TEMPO_LIMITE_MS = 2500
const ENDERECO = 'https://api.pwnedpasswords.com/range'

// Primeira barreira, sem internet: as senhas que aparecem no topo de todo vazamento, mais as
// tentativas obvias em portugues. Comparacao sem acento e sem maiuscula.
const LISTA_LOCAL = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '12345678910',
  '123123', '111111', '000000', '654321', '121212', '102030', '123321',
  'password', 'password1', 'passw0rd', 'qwerty', 'qwerty123', 'abc123', 'abcdef',
  'iloveyou', 'admin', 'admin123', 'master', 'letmein', 'welcome', 'monkey', 'dragon',
  'senha', 'senha123', 'senha1234', 'minhasenha', 'mudar123', 'mudar@123', 'trocar123',
  'brasil', 'brasil123', 'flamengo', 'corinthians', 'palmeiras', 'saopaulo', 'gremio',
  'futebol', 'familia', 'amoreterno', 'teamo', 'deusefiel', 'deusnocomando',
  'condominio', 'condominio123', 'sindico', 'sindico123', 'morador', 'morador123',
  'webcond', 'webcond123', 'teste', 'teste123', 'teste1234',
])

function normalizar(senha) {
  return String(senha || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Senha que qualquer lista de ataque tenta nas primeiras tentativas.
export function senhaMuitoComum(senha) {
  const valor = normalizar(senha)
  if (!valor) return false
  if (LISTA_LOCAL.has(valor)) return true
  // So numeros em sequencia (123456, 987654321) ou o mesmo caractere repetido (aaaaaa).
  if (/^0*123456789?0?$/.test(valor)) return true
  if (/^(.)\1+$/.test(valor)) return true
  return false
}

// Consulta o HaveIBeenPwned pelos 5 primeiros caracteres do hash. Devolve false em qualquer
// erro, demora ou resposta estranha: a verificacao nunca pode impedir um cadastro legitimo.
export async function senhaEmVazamento(senha, { timeoutMs = TEMPO_LIMITE_MS, fetchImpl = fetch } = {}) {
  const valor = String(senha || '')
  if (!valor) return false

  const hash = createHash('sha1').update(valor, 'utf8').digest('hex').toUpperCase()
  const prefixo = hash.slice(0, 5)
  const sufixo = hash.slice(5)

  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), timeoutMs)

  try {
    const resposta = await fetchImpl(`${ENDERECO}/${prefixo}`, {
      signal: controle.signal,
      // Add-Padding: a resposta vem sempre com o mesmo tamanho, entao nem o tamanho do
      // trafego diz alguma coisa sobre a senha.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'WebCond' },
    })
    if (!resposta.ok) return false

    const texto = await resposta.text()
    for (const linha of texto.split('\n')) {
      const [finalDoHash, quantidade] = linha.trim().split(':')
      // O preenchimento do Add-Padding vem com quantidade 0: so conta acima de zero.
      if (finalDoHash === sufixo) return Number(quantidade) > 0
    }
    return false
  } catch {
    return false
  } finally {
    clearTimeout(relogio)
  }
}

// Usada pelas rotas: devolve a mensagem para mostrar, ou '' quando a senha pode ser usada.
export async function recusaDeSenha(senha, opcoes) {
  if (senhaMuitoComum(senha)) return SENHA_VAZADA_AVISO
  if (await senhaEmVazamento(senha, opcoes)) return SENHA_VAZADA_AVISO
  return ''
}
