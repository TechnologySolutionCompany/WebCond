import { createRouter } from '../_lib/router.js'
import * as loginCnpj from '../_auth/login-cnpj.js'
import * as loginCpf from '../_auth/login-cpf.js'

export const { GET, POST } = createRouter({
  '/api/auth/login-cnpj': loginCnpj,
  '/api/auth/login-cpf': loginCpf,
})
