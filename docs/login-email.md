# Login por e-mail (e o caminho para Google e Apple)

## O que mudou

| Antes | Agora |
|---|---|
| Só CPF ou CNPJ + senha | **E-mail + senha** como jeito principal; CPF/CNPJ continua, a um clique ("Esqueci meu e-mail · entrar com CPF ou CNPJ") |
| Morador não via nem cadastrava o próprio e-mail de acesso | Card **Acesso ao WebCond** no perfil: mostra o e-mail de acesso, cadastra e troca |
| Síndico trocava o e-mail de login sem confirmar nada | Trocar o e-mail de acesso **pede a senha atual** |
| Morador trocava a senha direto no Supabase pelo navegador | Troca pelo servidor: **pede a senha atual** e passa pela **recusa de senha vazada** |

A escolha entre e-mail e CPF/CNPJ fica lembrada no navegador: quem entra sempre por CPF não
precisa clicar no link toda vez.

**Nenhuma mudança no banco.** Toda conta já tinha um e-mail no Supabase; o login por CPF só usava
o CPF para *achar* esse e-mail. Quem nunca informou um e-mail tem um identificador interno
(`morador-<cpf>-<condominio>@login.webcond.local`), que continua existindo só para o Supabase.

## Arquivos

- `src/lib/loginEmail.js` — regra única do e-mail de acesso (tela e servidor usam a mesma).
- `api/_auth/login-email.js` — rota `POST /api/auth/login-email`.
- `api/_lib/contaPropria.js` — troca da própria senha e do próprio e-mail de acesso. Síndico e
  morador usam a mesma função; as rotas só decidem quem pode chamar.
- `api/_tenant/account/email.js`, `api/_tenant/account/password.js` — rotas do morador
  (`/api/tenant/account-email`, `/api/tenant/account-password`). Entram na função que já existia
  para `tenant`: o limite de 12 funções da Vercel não muda.

## Decisões de segurança

**Uma resposta só para toda recusa.** E-mail que não existe, senha errada, conta desativada e
identificador interno recebem a mesma mensagem: *"E-mail ou senha incorretos."* A tela de login
não diz quem tem conta no WebCond.

**Limite de tentativas.** 10 por e-mail e 20 por IP a cada 15 minutos. O balde por IP é o mesmo do
login por CPF e por CNPJ: trocar de jeito de entrar não dá mais tentativas.

**O identificador interno não entra.** Ele tem o CPF dentro. Mesmo com a senha certa, digitá-lo no
campo de e-mail é recusado; quem não tem e-mail entra pelo CPF.

**Conta desativada: duas travas.** A desativação já bane a conta no Auth. A rota ainda confere o
perfil: se ele estiver inativo, a sessão recém-criada é descartada (só ela; as outras sessões da
pessoa não são derrubadas por causa de uma tentativa de login de terceiros).

**E-mail de acesso é credencial.** Trocar exige a senha atual, conferida *antes* de verificar se o
e-mail já está em uso — senão a rota viraria um jeito de descobrir quem usa o WebCond. O e-mail
muda no Auth e no perfil juntos (com desfazer se a segunda parte falhar): o login por CPF depende
dos dois estarem iguais.

## Limites conhecidos (honestos)

1. **O e-mail não é verificado.** Ninguém recebe um link de confirmação: o WebCond ainda não tem
   envio de e-mail (Resend pendente). Hoje isso é seguro porque **entrar sempre exige a senha** —
   quem digitou o e-mail errado só deixa de poder entrar por ele. Mas define duas regras:
   - **Não ligar "esqueci minha senha" por e-mail** antes de existir verificação. Com e-mail não
     verificado, o dono de um endereço digitado errado receberia o link e tomaria a conta.
   - **Não ligar Google/Apple** antes disso (próxima seção).
2. **O Supabase continua aceitando chamadas diretas.** A chave pública (anon) está no navegador,
   por natureza. Quem tem uma sessão aberta ainda consegue chamar a API do Supabase para trocar a
   própria senha sem a senha atual — a tela do WebCond não faz mais isso, mas a API do Supabase
   permite. Fechar no Supabase exige *Secure password change*, que manda código por e-mail:
   depende do mesmo envio de e-mail.
3. **Admin da plataforma não tem tela de perfil.** O seu acesso continua entrando por CNPJ (ou CPF);
   o e-mail dele é o identificador interno. Uma tela de perfil da plataforma resolve.
4. **O identificador interno tem o CPF dentro** e aparece no token de sessão de quem não cadastrou
   e-mail (só a própria pessoa e o servidor veem esse token). Trocar por um identificador aleatório
   é uma migração própria, a fazer com calma.

## Google e Apple: o caminho

O cadastro público do Supabase **já está desligado** (`disable_signup: true`, conferido em
02/10/2026) e só o provedor de e-mail está ativo. Isso é o que importa para os passos abaixo.

### Pré-requisitos (nesta ordem)

1. **Envio de e-mail funcionando** (Resend configurado como SMTP do Supabase).
2. **Verificação do e-mail de acesso**: ao cadastrar ou trocar o e-mail, a pessoa confirma por link.
   Até confirmar, o e-mail fica marcado como não verificado.
3. **Vinculação manual, nunca automática.** O Supabase liga uma conta Google a uma conta existente
   quando os e-mails batem. No WebCond o e-mail é digitado pelo síndico e pode estar errado: o dono
   real daquele Gmail cairia na conta de outra pessoa. Por isso:
   - a pessoa entra normalmente (e-mail ou CPF + senha) e, no perfil, clica em
     **"Conectar minha conta Google"** (`supabase.auth.linkIdentity({ provider: 'google' })`);
   - só depois disso o botão **"Entrar com Google"** funciona para ela;
   - no Supabase: *Authentication → Providers* ligar Google; *Auth → Settings* ligar
     **Allow manual linking**; **manter o cadastro público desligado** (assim um Google
     desconhecido não cria conta nenhuma).

### Google

- Grátis. Google Cloud Console → *APIs & Services → Credentials → OAuth client ID* (Web).
- *Authorized redirect URI*: `https://<projeto>.supabase.co/auth/v1/callback`.
- Client ID e Secret vão no Supabase (*Authentication → Providers → Google*), **não** na Vercel.
- No Supabase, *URL Configuration*: Site URL `https://webcond.vercel.app` e a mesma em
  *Redirect URLs*.

### Apple

- Exige o **Apple Developer Program (US$ 99/ano)**.
- A Apple deixa a pessoa esconder o e-mail ("Ocultar meu e-mail"): o endereço que chega é um
  relay `@privaterelay.appleid.com`, que nunca vai bater com o e-mail cadastrado. Mais um motivo
  para a vinculação manual pelo perfil.
- Recomendação: começar só com Google; Apple quando houver demanda de quem usa iPhone.

## Como conferir na mão

1. Tela inicial: o campo é **E-mail**. Entrar com o e-mail do síndico + senha.
2. Clicar em *Esqueci meu e-mail · entrar com CPF ou CNPJ*: entrar por CNPJ. Recarregar a página:
   continua no modo CPF/CNPJ (lembrado).
3. Entrar como morador (CPF). *Meu perfil → Acesso ao WebCond*: "Nenhum cadastrado".
   Cadastrar um e-mail **sem** a senha atual → recusa. Com a senha → salvo.
4. Sair e entrar com esse e-mail. Sair e entrar pelo CPF: os dois funcionam, mesma senha.
5. *Senha de acesso*: tentar trocar sem a senha atual → recusa. Tentar `12345678` → recusa.
6. Perfil do síndico: mudar o e-mail → aparece o campo **Sua senha atual**.

Automatizado: `node scripts/security-test.mjs` (grupo *Login por e-mail*, 20 checagens) e
`npm test` (`tests/login-email.test.js`).
