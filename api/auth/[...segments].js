import { createRouter } from '../_lib/router.js'
import * as loginCnpj from '../_auth/login-cnpj.js'
import * as loginCpf from '../_auth/login-cpf.js'
import * as loginEmail from '../_auth/login-email.js'
import * as cadastroInfo from '../_auth/cadastro-info.js'
import * as cadastroEnviar from '../_auth/cadastro-enviar.js'
import * as confirmarCadastro from '../_auth/confirmar-cadastro.js'
import * as reenviarConfirmacao from '../_auth/reenviar-confirmacao.js'
import * as pagamentoInfinitePay from '../_auth/pagamento-infinitepay.js'
import * as contatoSindico from '../_auth/contato-sindico.js'

export const { GET, POST } = createRouter({
  '/api/auth/login-cnpj': loginCnpj,
  '/api/auth/login-cpf': loginCpf,
  '/api/auth/login-email': loginEmail,
  // Auto-cadastro do morador pelo link do sindico (publico, sem sessao).
  '/api/auth/cadastro-info': cadastroInfo,
  '/api/auth/cadastro-enviar': cadastroEnviar,
  // v1.09A5: confirmacao do cadastro do condominio pelo e-mail e webhook do banco (publicos).
  '/api/auth/confirmar-cadastro': confirmarCadastro,
  '/api/auth/reenviar-confirmacao': reenviarConfirmacao,
  '/api/auth/pagamento-infinitepay': pagamentoInfinitePay,
  // v2.10A2: "Esqueci a senha" -> WhatsApp do sindico
  '/api/auth/contato-sindico': contatoSindico,
})
