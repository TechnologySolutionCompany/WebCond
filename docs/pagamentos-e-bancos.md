# Pagamentos, bancos e a fatura padronizada (v1.09A5)

Respostas às perguntas do `tscbr trabalho.md` e o que já ficou pronto no código.

---

## 1. "Nem todo condomínio usa o mesmo banco. Como fazer?"

**Decisão aplicada: a fatura é uma só; o banco é escolha de cada condomínio.**

| Camada | Igual para todos? | Onde fica |
|---|---|---|
| **Fatura** (layout, itens, gráfico de 3 meses, unidades em aberto) | Sim — o modelo `fatura-template.html` | `api/_lib/fatura/` |
| **QR Code Pix** na fatura | Sim — padrão oficial do Banco Central | `src/lib/pix.js` |
| **Para onde vai o dinheiro** | Não — cada síndico escolhe | *Meu perfil › Recebimento* |

Hoje existem dois modos, e o síndico troca quando quiser:

1. **Pix direto (qualquer banco)** — padrão. Condomínio 1 na InfinitePay, Condomínio 2 no Nubank,
   Condomínio 3 na Caixa: todos funcionam. A fatura sai com o QR Code Pix da chave do condomínio,
   **já com o valor e a identificação da unidade**. Não precisa de integração nenhuma.
   Limite: o banco não avisa o WebCond. O morador toca em "Confirmar pagamento" e o síndico dá a baixa.
2. **InfinitePay (baixa automática)** — além do QR, cada cobrança ganha um link **"Pagar agora"**
   (Pix ou cartão). Quando o banco confirma, a cobrança vira **paga sozinha**.

> **Correção importante feita nesta versão:** o "Pix copia e cola" que o WebCond gerava até a
> v1.09A4 era `PIX|chave|valor|ref` — **nenhum app de banco lê isso**. Agora é o BR Code oficial
> (EMV + CRC16), testado em `tests/v109a5.test.js`. Os QR Codes das faturas novas funcionam em qualquer banco.

### E a ideia de "um banco só no sistema, só designando quem recebe"?

É o modelo de **subcontas** (ex.: Asaas, Efí/Gerencianet, Pagar.me): a TSCBr tem uma conta-mãe e cada
condomínio ganha uma subconta; o dinheiro cai na subconta do condomínio e a baixa é automática para
todos, de qualquer banco de destino.

- **Vantagem:** baixa automática para todos os condomínios, uma integração só para manter.
- **Custo:** a TSCBr passa a intermediar dinheiro de terceiros — cada condomínio faz cadastro/KYC
  no provedor, há contrato de intermediação e responsabilidade em estorno e chargeback.
- **Recomendação:** não agora. Encaixa bem como diferencial do **Plano Pro (v2.10A1)** — a estrutura de
  "provedores" já está pronta para receber mais um (`api/_lib/pagamentos/`).

---

## 2. InfinitePay no seu condomínio: o que eu preciso

O código está pronto (link de pagamento, webhook, conferência na volta do app). Para ligar:

1. **A InfiniteTag da conta InfinitePay do condomínio** — o nome de usuário com `$` no app.
   De preferência uma conta **no CNPJ do condomínio**, não pessoal.
2. **Checkout/Link integrado habilitado** nessa conta (no app InfinitePay). A API não usa chave secreta:
   a conta é identificada só pela InfiniteTag.
3. **Aplicar o SQL** `sql/2026-10-03_feedback_e_recebimento.sql` no Supabase.
4. **Publicar** (só depois do seu "pode subir") com `APP_URL` = endereço https de produção.
   O webhook da InfinitePay **não chega em localhost**: o teste real é no site publicado.
5. **Teste de R$ 1,00**: em *Recebimento*, escolher InfinitePay e salvar a tag → lançar uma cobrança
   de R$ 1,00 para a sua unidade → pagar por "Pagar agora" → em segundos a cobrança deve ficar **Paga**,
   com o botão **Comprovante do banco**.

**Segurança:** o webhook da InfinitePay não é assinado. Por isso o WebCond **nunca** dá baixa pelo que
chega no webhook: ele só diz "confira o pedido X", e o servidor consulta a InfinitePay
(`payment_check`) e compara o valor pago com o valor da cobrança antes de marcar como paga.

**Confira no app InfinitePay** as taxas do checkout (Pix e cartão) antes de ligar para todos.

---

## 3. Fatura × cobrança pelo banco: não é redundância?

Não: as duas fazem papéis diferentes, e a fatura nova junta as duas.

- **A fatura é o documento.** Prova que a cobrança foi feita (número, emissão, vencimento, itens,
  valor). É ela que vale para conversa com inadimplente, assembleia e prestação de contas.
- **O banco é o meio de pagamento.** O link "Pagar agora" e o QR Code Pix ficam **dentro** da fatura.
- Gerada todo mês, para toda unidade, mesmo com cobrança automática pelo banco — como você pediu.

### Como a fatura nova foi implementada (o prompt do `tscbr trabalho.md`)

- Template **Handlebars** = `fatura-template.html` (cópia de servidor em
  `api/_lib/fatura/fatura-template.html`; o original fica em `fatura/` como referência de desenho).
- Dados no formato do `fatura-exemplo.json`, montados por `src/lib/faturaDados.js`.
- **PDF A4 com Puppeteer** (`api/_lib/fatura/render.js`), pela rota que já existia
  (`/api/admin/billing/render-pdf`, modelo `"fatura"`). Se o gerador falhar, o boleto antigo continua
  como reserva.
- **Gráfico dos últimos 3 meses**: sai das cobranças gravadas. *Pago* = confirmado (pelo banco na baixa
  automática, ou pelo síndico). *Inadimplente* = vencida há mais de 2 dias. *Não pago* = o resto.
- **Unidades em aberto**: as que têm cobrança vencida (só o número, nunca o nome).
- **QR Code Pix**: BR Code oficial da chave do condomínio, com o valor da unidade.
- Exemplo pronto para conferir: `npm run fatura-exemplo` → `fatura/saida/fatura-exemplo.pdf`.

> ⚠️ **Lista de unidades em aberto.** A fatura vai para todos os moradores. Expor devedores pode ser
> entendido como **cobrança vexatória (CDC, art. 42)** e já gerou condenação por danos morais em
> condomínio. O WebCond mostra só o número da unidade e o síndico pode desligar em
> *Recebimento*. Recomendo aprovar o uso em assembleia.

---

## 4. Vender os planos ONE / PRO / MAX: qual banco usar para receber?

São **assinaturas mensais** (R$ 49,90 / R$ 65,90 / R$ 89,90). O que importa é cobrança **recorrente**
automática + aviso por webhook para o WebCond liberar ou bloquear o plano sozinho.

| Provedor | Recorrência automática | Pix | Boleto | Nota fiscal | Observação |
|---|---|---|---|---|---|
| **Asaas** ✅ | Sim (assinaturas) | Sim | Sim | **Emite NFS-e sozinho** | Feito para SaaS pequeno no Brasil; API e webhooks simples |
| Mercado Pago | Só cartão | Avulso | Avulso | Não | Bom checkout, assinatura limitada a cartão |
| Stripe | Sim (cartão) | Limitado | Sim | Não | Excelente API, pensado para cartão |
| InfinitePay | **Não** (só link avulso) | Sim | Não | Não | Ótima para o condomínio receber; fraca para assinatura |

**Recomendação: Asaas** para a TSCBr receber os planos.
- O `src/lib/assinatura.js` já reserva o lugar (`VITE_ASSINATURA_PROVEDOR=asaas`).
- Precisa de conta **no CNPJ da TSCBr** (MEI serve) para emitir nota fiscal.
- Confira as taxas atuais no site do Asaas antes de decidir.
- Fica para a fase do **Plano Pro (v2.10A1)**, como combinado. Até lá, a contratação segue pelo
  WhatsApp da TSCBr.
