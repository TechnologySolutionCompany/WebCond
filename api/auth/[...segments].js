import { createRouter } from '../_lib/router.js'
import * as loginCnpj from '../_auth/login-cnpj.js'
import * as loginCpf from '../_auth/login-cpf.js'
import * as cadastroInfo from '../_auth/cadastro-info.js'
import * as cadastroEnviar from '../_auth/cadastro-enviar.js'

export const { GET, POST } = createRouter({
  '/api/auth/login-cnpj': loginCnpj,
  '/api/auth/login-cpf': loginCpf,
  // Auto-cadastro do morador pelo link do sindico (publico, sem sessao).
  '/api/auth/cadastro-info': cadastroInfo,
  '/api/auth/cadastro-enviar': cadastroEnviar,
})
