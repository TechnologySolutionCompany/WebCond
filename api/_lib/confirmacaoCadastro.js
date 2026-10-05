// Confirmacao do cadastro do condominio por e-mail (v1.09A5).
//
// O condominio nasce "pending". O sindico recebe um e-mail de boas-vindas com o botao
// "Confirmar cadastro"; ao confirmar, o condominio vira "active" e o teste gratis comeca na hora,
// sem esperar a plataforma. Sem e-mail configurado (Resend), nada muda: fica pendente e a
// plataforma aprova na mao, como antes.
//
// Seguranca:
// - o token so existe no e-mail. No banco fica o hash SHA-256 (metadata.confirmacao_email.hash);
// - o link usa "#token=" (fragmento): o token nao vai para log de servidor nem de proxy;
// - vale 48 horas e e de uso unico (o hash sai do banco ao confirmar).
import { createHash, randomBytes } from 'node:crypto'

export const CONFIRMACAO_VALIDADE_MS = 48 * 60 * 60 * 1000

// Mesma regra de notify.js (getChannelConfig), sem carregar o web-push nesta funcao.
export function emailConfigurado(env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL_FROM)
}

export function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

export function novoTokenDeConfirmacao(now = new Date()) {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    registro: {
      hash: hashToken(token),
      enviado_em: now.toISOString(),
      expira_em: new Date(now.getTime() + CONFIRMACAO_VALIDADE_MS).toISOString(),
    },
  }
}

// Condominio esperando a confirmacao pelo e-mail (e nao a aprovacao manual da plataforma).
export function aguardandoConfirmacao(condominium) {
  const registro = condominium?.metadata?.confirmacao_email
  return String(condominium?.status || '') === 'pending' && Boolean(registro?.enviado_em) && !registro?.confirmado_em
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function appUrl() {
  return String(process.env.APP_URL || 'https://webcond.vercel.app').replace(/\/+$/, '')
}

// Texto pedido pela TSCBr: "Bem-vindo(a) [sindico] com [condominio]. Esta mensagem e automatica
// para voce confirmar seu acesso a plataforma do WebCond." + botao "Confirmar cadastro".
export function montarEmailBoasVindas({ nomeSindico, nomeCondominio, token }) {
  const link = `${appUrl()}/confirmar-cadastro#token=${encodeURIComponent(token)}`
  const nome = String(nomeSindico || '').trim() || 'sindico(a)'
  const condominio = String(nomeCondominio || '').trim() || 'seu condominio'
  const logo = `${appUrl()}/logo-email.png`

  const text = [
    `Bem-vindo(a), ${nome}, com ${condominio}!`,
    '',
    'Esta mensagem e automatica para voce confirmar seu acesso a plataforma do WebCond.',
    '',
    `Confirmar cadastro: ${link}`,
    '',
    'Depois de confirmar, entre com este e-mail e a senha que voce cadastrou. O condominio comeca o teste gratis na hora.',
    'O link vale por 48 horas. Se voce nao fez este cadastro, ignore este e-mail: nada sera liberado.',
  ].join('\n')

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2328;max-width:520px;margin:0 auto;padding:8px">
<p style="margin:0 0 22px"><img src="${escapeHtml(logo)}" alt="WebCond" width="150" style="display:block;border:0;height:auto;width:150px" /></p>
<p style="font-size:20px;font-weight:bold;margin:0 0 12px">Bem-vindo(a), ${escapeHtml(nome)}, com ${escapeHtml(condominio)}!</p>
<p style="margin:0 0 22px;color:#57606a;line-height:1.6">Esta mensagem e automatica para voce confirmar seu acesso a plataforma do WebCond.</p>
<p style="margin:0 0 26px"><a href="${escapeHtml(link)}" style="background:#3DAE4A;color:#ffffff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Confirmar cadastro</a></p>
<p style="margin:0 0 8px;color:#57606a;font-size:13px;line-height:1.6">Depois de confirmar, entre com este e-mail e a senha que voce cadastrou. O condominio comeca o teste gratis na hora.</p>
<p style="margin:0 0 8px;color:#8c959f;font-size:12px;line-height:1.6">O botao nao abriu? Copie e cole no navegador:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="margin:18px 0 0;color:#8c959f;font-size:11px">O link vale por 48 horas. Se voce nao fez este cadastro, ignore este e-mail: nada sera liberado.<br>WebCond · TSCBr Technology Solution Company BR</p>
</div>`

  return { subject: `Bem-vindo(a) ao WebCond: confirme o cadastro de ${condominio}`.slice(0, 120), text, html }
}

// Envio de um e-mail (Resend). Devolve true/false; nunca expoe a chave nem a resposta crua.
export async function enviarEmail({ to, subject, text, html }) {
  if (!emailConfigurado()) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    })
    return response.ok
  } catch {
    return false
  }
}
