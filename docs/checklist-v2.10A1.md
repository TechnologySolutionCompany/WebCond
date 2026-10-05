# Checklist de validação — v2.10A1 (Plano Pro)

A **v2.10A1 é o projeto inteiro**: tudo da v1.09A5 (já levado para a raiz) + o início do Plano Pro +
login por e-mail obrigatório. Nada foi publicado nem commitado. Sobe só com o seu **"pode subir"**.

Conferido por mim: `npm test` (194 testes, 0 falhas), `npm run lint` limpo, `npm run build` ok,
rotas novas respondendo no servidor local, e o aviso "Cadastre seu e-mail" testado de verdade
(entrando com a conta da plataforma, sem salvar nada).

## Antes de começar

- [ ] Na raiz: `npm install` (entrou `handlebars`).
- [ ] No Supabase: `sql/2026-10-03_feedback_e_recebimento.sql` (é o único SQL novo; a tabela
      `assinatura_eventos` do Pro já existia, do SQL 2026-09-28).
- [ ] `npm run dev` → `http://localhost:5173`.

---

## Parte 1 — Tudo da v1.09A5

Os itens 1 a 9 de `docs/checklist-v1.09A5.md` continuam valendo (tela inicial, zoom, última tela,
Sobre/Feedback, confirmação do cadastro por e-mail, fatura nova, InfinitePay). Duas mudanças por
causa do Pro:

- O **QR Code Pix automático** e a **InfinitePay** agora são do **Plano PRO** (veja a Parte 3).
- O item 1 (login) mudou: veja a Parte 2.

## Parte 2 — Login por e-mail obrigatório

- [ ] A tela inicial **sempre** abre no **E-mail**, mesmo para quem entrou por CPF da última vez.
- [ ] *Esqueci meu e-mail · entrar com CPF ou CNPJ* continua funcionando, mas não fica mais lembrado:
      recarregou, volta para o e-mail.
- [ ] Entrar por CPF/CNPJ com uma conta **sem e-mail** → aparece **"Cadastre seu e-mail de acesso"**.
      Não dá para fechar: só **Salvar e continuar** ou **Sair**.
- [ ] Cadastrar o e-mail (pede a senha atual) → o painel abre normal. Sair e entrar **com o e-mail**.
- [ ] Vale para morador, síndico, contador **e para você na plataforma** (sua conta de admin entra por
      CNPJ e não tem e-mail: na primeira entrada depois de publicar, o aviso vai aparecer para você).
- [ ] E-mail já usado por outra pessoa → recusa com "Este e-mail já está em uso".

## Parte 3 — Plano Pro: o que ele libera

Para testar, ponha um condomínio de teste no **PRO ativo** pela plataforma (Condomínios → plano PRO →
ativar), e compare com outro no **ONE** ou em teste.

| | ONE / teste grátis | PRO ativo |
|---|---|---|
| Chave Pix escrita na fatura | ✔ | ✔ |
| QR Code Pix gerado sozinho, com o valor da unidade | — (vale o QR/código que o síndico enviar) | ✔ |
| InfinitePay: link "Pagar agora" + baixa automática | — | ✔ |
| Documentos por mês | 10 | 20 |
| Aviso de cobrança por WhatsApp | — | em breve (falta ligar a conta da Meta) |

- [ ] **ONE** → lançar cobrança sem colar Pix: a fatura sai **com a chave escrita e sem QR**. Colar um
      "Pix copia e cola" do seu banco ou enviar a imagem do QR → a fatura sai com ele.
- [ ] **ONE** → Meu perfil → Recebimento: a opção InfinitePay aparece **bloqueada ("Plano PRO")** com o
      botão *Conhecer o Plano PRO*.
- [ ] **PRO** → lançar cobrança: QR Code gerado sozinho; ler com o app do banco → valor certo.
- [ ] **PRO** → InfinitePay liberada em Recebimento (precisa da InfiniteTag; teste real só publicado).
- [ ] PRO **vencido** volta a se comportar como ONE (e o painel fica só leitura, como antes).
- [ ] Tela **Planos e valores**: o PRO não mostra mais "(em breve)", exceto o WhatsApp. O MAX continua
      "em desenvolvimento" e o botão dele vira *Tenho interesse no MAX* (WhatsApp).

## Parte 4 — Contratar o plano dentro do sistema (Asaas)

**Sem as variáveis do Asaas, nada muda:** o botão continua indo para o WhatsApp da TSCBr.
Para ligar (comece no **sandbox**, é grátis):

1. Criar conta em `sandbox.asaas.com` → *Integrações* → gerar a **chave de API**.
2. *Integrações → Webhooks* → novo webhook:
   - URL: `https://<seu-site>/api/platform/assinatura-webhook`
   - Token de autenticação: invente um texto longo (é o `ASAAS_WEBHOOK_TOKEN`)
   - Eventos: cobranças (*PAYMENT_*) e assinaturas (*SUBSCRIPTION_*).
3. Na Vercel: `ASAAS_API_KEY`, `ASAAS_AMBIENTE=sandbox`, `ASAAS_WEBHOOK_TOKEN` e
   `VITE_ASSINATURA_PROVEDOR=asaas`.

Com o sandbox ligado (só dá para testar publicado, por causa do webhook):

- [ ] Síndico → Meu perfil → Melhorar meu plano → **Assinar o plano PRO** → abre a página do Asaas
      (Pix, boleto ou cartão). O plano **ainda não muda**.
- [ ] Pagar no sandbox (o Asaas tem botão para simular o pagamento) → em segundos o condomínio fica
      **PRO ativo**, válido por 30 dias. Em *Planos e valores* aparece "Assinatura ativa em Asaas".
- [ ] Clicar de novo em *Assinar o plano PRO* antes de pagar → reabre **a mesma cobrança** (não cria outra).
- [ ] Condomínio com o plano **vencido** também consegue assinar (é quem mais precisa).
- [ ] Simular estorno → o plano pago acaba na hora (painel só leitura).
- [ ] Cancelar a assinatura no Asaas → o plano segue até o vencimento já pago.
- [ ] Na plataforma, o plano do condomínio aparece certo na lista. *(A tela com o histórico de
      eventos da assinatura fica para o próximo ajuste; os eventos já ficam gravados em
      `assinatura_eventos`.)*

Na hora de ir para produção: trocar para a chave de produção, `ASAAS_AMBIENTE=producao` e
recadastrar o webhook no Asaas de produção.

---

## O que ficou para os próximos ajustes

- **WhatsApp do morador** (PRO): o código já existe; falta a conta oficial da Meta (`docs/notificacoes.md`).
- **MAX**: boleto personalizado, fatura automática pelo WhatsApp e atendimento prioritário.
- **Plataforma**: tela com o histórico de pagamentos da assinatura de cada condomínio.

## Pasta `v1.09A5/`

Continua no disco como foto da v1.09A5, mas **não vai para o site** (está no `.vercelignore`) e fica
fora do lint. Ela tem uma cópia do `node_modules` (pesa no OneDrive): pode apagar quando validar.

## Arquivos novos da v2.10A1

| Assunto | Arquivos |
|---|---|
| E-mail obrigatório | `src/components/shared/EmailObrigatorio.jsx`, `src/lib/loginEmail.js`, `src/pages/Landing.jsx` |
| Recursos do Pro por condomínio | `src/lib/condominiumPlan.js` (`condominiumHasResource`, `profileHasResource`) |
| Assinatura (Asaas) | `api/_lib/assinatura/asaas.js`, `api/_admin/assinatura-checkout.js`, `api/_platform/assinatura-webhook.js`, `src/components/admin/Planos.jsx` |
| Testes | `tests/v210a1.test.js` |
