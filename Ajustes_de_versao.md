# Ajustes de versão — WebCond

Lista do que fica para os próximos ajustes. Ao concluir um item, marque `[x]` e anote a versão.

## Próximo ajuste

### E-mail automático do sistema (Resend)

Hoje o cadastro de condomínio novo fica **pendente** até a plataforma aprovar manualmente, porque o
envio de e-mail não está ligado. Com o Resend configurado, o síndico recebe o e-mail
"Bem-vindo(a)… Confirmar cadastro" e o condomínio entra sozinho no plano **TESTE**. As mesmas
variáveis também ligam os avisos e as cobranças por e-mail para os moradores.

O código já está pronto (`api/_lib/confirmacaoCadastro.js`, `api/_auth/confirmar-cadastro.js`).
Falta só a configuração, que é feita **na Vercel** (não no Supabase):

- [ ] Criar a conta em **resend.com**.
- [ ] Verificar o domínio no Resend (**Domains → Add Domain**) e cadastrar os registros DNS
      (MX, SPF e DKIM) onde o domínio é gerenciado. Sem domínio verificado o Resend só envia para o
      e-mail do dono da conta.
- [ ] Gerar a chave em **API Keys → Create API Key** (permissão *Sending access*; começa com `re_`).
- [ ] Na Vercel → projeto **webcond** → **Settings → Environment Variables** (ambiente *Production*):
  - `RESEND_API_KEY` = a chave `re_...`
  - `NOTIFY_EMAIL_FROM` = `WebCond <nao-responda@SEU-DOMINIO>` (precisa ser do domínio verificado)
  - `APP_URL` = `https://webcond.vercel.app` (endereço do botão "Confirmar cadastro")
- [ ] **Redeploy** do último deploy (variável nova só vale depois de um deploy).
- [ ] Testar: cadastrar um condomínio de teste com um e-mail seu → receber o e-mail → confirmar →
      condomínio ativo no TESTE → entrar com e-mail e senha. Se não chegar, ver **Resend → Logs**.
      Excluir o condomínio de teste depois.

### Banco de dados

- [ ] Rodar no Supabase o SQL `sql/2026-10-03_feedback_e_recebimento.sql` (sem ele a tela de
      Feedback não funciona).

## Histórico

### v2.10A2 — 05/10/2026 (no ar)

- Equipe de suporte entra por e-mail (CPF opcional).
- Políticas com data e versão automáticas (vêm do `package.json`).
- Correções de segurança (PDF do boleto, recibo da InfinitePay, erros do cadastro público).
- Sistema zerado: ficou só a conta de administrador da plataforma.
- Tela inicial: "Esqueci meu e-mail" → entrar com CPF e senha; "Esqueci a senha" → pedir a troca
  ao síndico pelo WhatsApp do condomínio.
