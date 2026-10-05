// E-mail de acesso: regra unica para a tela de login, o perfil e o servidor.
//
// Toda conta do WebCond ja tem um e-mail no Supabase. Quem nunca informou um e-mail recebe um
// identificador interno (morador-<cpf>-<condominio>@login.webcond.local) que serve so para o
// Supabase: ninguem digita, ninguem recebe mensagem nele. Por isso ele nunca vale como
// "e-mail de acesso" e nunca aparece na tela.

export const INTERNAL_LOGIN_DOMAIN = 'login.webcond.local'
const INTERNAL = /@login\.webcond\.local$/i
// Mesmo formato aceito no cadastro de pessoas (api/_lib/personValidation.js).
const FORMAT = /^[^\s@;]+@[^\s@;]+\.[^\s@;.]+$/
const MAX_LENGTH = 254

export function normalizeLoginEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isInternalLoginEmail(value) {
  return INTERNAL.test(normalizeLoginEmail(value))
}

// E-mail que a pessoa pode usar para entrar: formato valido e nao interno.
export function isValidLoginEmail(value) {
  const email = normalizeLoginEmail(value)
  return email.length > 0 && email.length <= MAX_LENGTH && FORMAT.test(email) && !INTERNAL.test(email)
}

// O que mostrar no perfil: o e-mail de acesso, ou vazio quando so existe o interno.
export function loginEmailForDisplay(value) {
  return isValidLoginEmail(value) ? normalizeLoginEmail(value) : ''
}

// Jeito de entrar na tela de login (v2.10A1): SEMPRE comeca pelo e-mail. CPF/CNPJ e so a saida
// de quem esqueceu o e-mail, a um clique, e nao fica mais lembrado no navegador. Quem entra pelo
// CPF e ainda nao tem e-mail e obrigado a cadastrar um logo depois (EmailObrigatorio.jsx).
export const LOGIN_MODES = Object.freeze({ email: 'email', documento: 'documento' })
export const LOGIN_MODE_INICIAL = LOGIN_MODES.email

// Precisa cadastrar e-mail de acesso: so tem o identificador interno (ou nenhum e-mail).
export function precisaCadastrarEmail(profile) {
  return Boolean(profile) && !isValidLoginEmail(profile.email)
}
