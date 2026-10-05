# Checklist de validação — v1.09A5

Tudo desta versão está **só na pasta `v1.09A5/`**. A raiz do projeto e o site publicado não foram
tocados. Nada sobe antes do seu **"pode subir"**.

Já conferido por mim: `npm test` (181 testes, 0 falhas), `npm run lint` limpo, `npm run build` ok,
tela inicial e cadastro em 390×844 (sem rolagem lateral, campos com 16px), fatura de exemplo em PDF
(1 folha A4), rotas novas respondendo no servidor local.

## Antes de começar

- [ ] `cd v1.09A5` e `npm install` (entrou a dependência `handlebars`).
- [ ] Rodar no Supabase (SQL Editor): `sql/2026-10-03_feedback_e_recebimento.sql`.
      O resultado da conferência no fim tem de bater com o que cada linha pede.
- [ ] `npm run dev` → `http://localhost:5173`. Para o celular, use o IP do computador na mesma rede
      (ou valide depois de publicar).

---

## 1. Entrar por e-mail (CPF/CNPJ só se esquecer o e-mail)

- [ ] A tela inicial pede **E-mail** e **Senha**.
- [ ] *Esqueci meu e-mail · entrar com CPF ou CNPJ* troca para CPF/CNPJ. *Entrar com e-mail* volta.

## 2. E-mail obrigatório no cadastro

- [ ] Síndico → Unidades → nova unidade: salvar sem o e-mail do proprietário → **recusa**.
- [ ] Mesma coisa com o inquilino. Editar uma unidade **antiga** sem e-mail continua salvando.
- [ ] Contador (Relatórios): cadastrar sem e-mail → recusa.
- [ ] Autocadastro pelo link: proprietário sem e-mail → recusa. Inquilino **sem acesso** pode ficar sem.
- [ ] Planilha de importação continua aceitando unidade sem e-mail (de propósito: é carga em massa).

## 3. Tela inicial minimalista (celular)

- [ ] No celular: logo, e-mail, senha, Entrar e "É síndico? Cadastre seu condomínio". **Cabe sem rolar.**
- [ ] Rodapé grande saiu; ficou uma linha: © TSCBr · versão · Privacidade · Segurança.
- [ ] Abrir **"É síndico? Cadastre seu condomínio"**: o formulário ocupa a tela inteira e, **no fim, aparecem
      as informações do rodapé** (contato, WhatsApp, redes, políticas).
      *(Entendi "Roda-PE" como "rodapé". Se era outra coisa, me diga.)*
- [ ] O "X" do cadastro fecha o formulário (o botão de tema some enquanto ele está aberto).

## 4. Zoom no celular

- [ ] Abrir o app instalado: ele abre **sem zoom**.
- [ ] Tocar num campo para digitar: **não dá zoom** (todo campo tem 16px no celular).
- [ ] Girar o celular: o texto não aumenta sozinho.
- [ ] Depois de publicar: o app instalado pega a versão nova sozinho (cache do app subiu para `webcond-v5`).
      Se algum celular ainda abrir com zoom, feche o app e abra de novo uma vez.

## 5. Voltar exatamente onde estava

- [ ] Morador → Minhas cobranças → abrir uma cobrança → **Abrir boleto** (vai para o navegador).
      Voltar ao app: reabre **Minhas cobranças com a mesma cobrança aberta**.
- [ ] Fechar o app de vez e abrir: continua na última tela (vale por 12 horas).
- [ ] Síndico e plataforma: a última página aberta também volta.
- [ ] Atenção: a regra antiga de **sair sozinho após 5 minutos fora** continua. Se o morador demorar
      mais de 5 minutos no app do banco, precisa entrar de novo — mas depois de entrar volta para a
      mesma tela. Quer aumentar esse tempo (ex.: 15 min)? É uma linha em `src/lib/sessionActivity.js`.

## 6. Suporte › Sobre e Feedback

- [ ] Síndico → **Suporte**: abas **Chamados · Feedback · Sobre**.
- [ ] Morador: item novo **Suporte** no menu, com **Feedback · Sobre**.
- [ ] **Sobre**: versão atual (v1.09A5), "Falar com o suporte da TSCBr" (WhatsApp já com a versão na
      mensagem), e-mail, site, redes, políticas.
- [ ] **Feedback**: enviar um (assunto + nota opcional + mensagem). Tentar 6 seguidos → o 6º é recusado
      (limite de 5 a cada 10 min).
- [ ] Plataforma → **Feedback** (contador no menu): aparece com nome, perfil, condomínio e versão.
      Marcar como lido, arquivar, desarquivar.

## 7. Cadastro de condomínio com confirmação por e-mail

**Depende do envio de e-mail (Resend).** Sem ele, nada muda: o condomínio fica pendente e você aprova na
mão, como hoje. Para ligar:

1. Criar conta no Resend e **verificar o domínio** `tscbr.com.br` (registros DNS que o Resend mostra).
2. Na Vercel (e no `.env` local): `RESEND_API_KEY` e `NOTIFY_EMAIL_FROM=WebCond <nao-responda@tscbr.com.br>`.

Com o e-mail ligado:

- [ ] Cadastrar um condomínio de teste com um e-mail seu. A tela final diz "Enviamos uma mensagem para…".
- [ ] Chega o e-mail: **"Bem-vindo(a), [síndico], com [condomínio]!"**, o texto automático e o botão
      **Confirmar cadastro**.
- [ ] Antes de confirmar, entrar com e-mail e senha → aviso "Falta confirmar o cadastro" + botão
      **Reenviar e-mail de confirmação**.
- [ ] Tocar em **Confirmar cadastro** → "Cadastro confirmado!" → entrar: painel liberado, **Meu plano =
      Teste gratuito, 30 dias a partir de hoje**.
- [ ] Abrir o mesmo link de novo → "Cadastro já confirmado".
- [ ] Na plataforma, o condomínio aparece **ativo**. Se você **bloquear** um condomínio ainda pendente,
      o link do e-mail **não** libera.

## 8. Recebimento e fatura nova

- [ ] Síndico → Meu perfil → **Recebimento**: chave Pix (o sistema mostra o tipo: e-mail, celular, CPF…),
      banco, "Pix direto" ou "InfinitePay", lista de unidades em aberto (liga/desliga), instruções.
- [ ] Lançar uma cobrança → abrir o boleto: é a **fatura nova** (layout do `fatura-template.html`).
- [ ] **Ler o QR Code com o app do seu banco**: tem de abrir o Pix com a chave do condomínio e o
      **valor certo** já preenchido. *(Antes desta versão o QR não funcionava em banco nenhum.)*
- [ ] "Copiar PIX" no app do morador cola um código que o banco aceita.
- [ ] Gráfico dos 3 meses e unidades em aberto batem com as cobranças do condomínio.
- [ ] Sem Chrome no servidor local, o PDF cai no boleto antigo (reserva). Na Vercel usa o Chromium dela.
- [ ] Layout sem banco: `npm run fatura-exemplo` → `fatura/saida/fatura-exemplo.pdf`.

## 9. InfinitePay (só depois de publicar)

Precisa da **InfiniteTag** da conta do condomínio. Passo a passo completo em
`docs/pagamentos-e-bancos.md`, seção 2. Em resumo: salvar a tag em Recebimento → cobrança de R$ 1,00 →
pagar por **"Pagar agora"** → a cobrança vira **Paga** sozinha, com **Comprovante do banco**.

---

## O que ficou de fora de propósito

- **Plano Pro / v2.10A1**: nada mexido, como combinado.
- **Assinatura dos planos ONE/PRO/MAX**: recomendação (Asaas) em `docs/pagamentos-e-bancos.md`, seção 4.
- **Bancos com subconta (um banco só para todos)**: explicado na seção 1 do mesmo arquivo; sugestão para o Pro.

## Arquivos principais desta versão

| Assunto | Arquivos |
|---|---|
| Tela inicial / cadastro | `src/pages/Landing.jsx`, `index.html`, `src/styles/global.css` |
| Confirmação por e-mail | `api/_lib/confirmacaoCadastro.js`, `api/_auth/confirmar-cadastro.js`, `api/_auth/reenviar-confirmacao.js`, `src/pages/ConfirmarCadastro.jsx` |
| Última tela | `src/lib/lastView.js` + os três layouts |
| Suporte / Sobre / Feedback | `src/components/shared/{SuporteHub,Sobre,FeedbackForm}.jsx`, `src/components/platform/PlatformFeedbacks.jsx`, `api/_lib/feedbackSend.js`, `api/_platform/feedbacks.js` |
| Pix e recebimento | `src/lib/pix.js`, `src/lib/recebimento.js`, `api/_lib/pagamentos/`, `src/components/admin/RecebimentoTab.jsx` |
| Fatura | `api/_lib/fatura/`, `src/lib/faturaDados.js`, `scripts/gerar-fatura-exemplo.mjs` |
| Banco | `sql/2026-10-03_feedback_e_recebimento.sql` |
| Testes | `tests/v109a5.test.js` |
