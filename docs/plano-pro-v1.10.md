# Plano Pro e cobrança da assinatura — espaço pronto para a v1.10

A v1.09 fecha aqui. A v1.10 é a versão do **Plano Pro**: geração automática do Pix no boleto,
aviso de cobrança pelo WhatsApp e a assinatura sendo cobrada dentro do sistema.

Este documento descreve o que **já ficou pronto** para receber isso, para que na v1.10 não seja
preciso remexer em tela nenhuma.

---

## 1. Recursos por plano: uma chave, não um `if` por tela

Em `src/lib/condominiumPlan.js` existem duas listas, de propósito separadas:

```js
PLAN_RESOURCES      // o que cada plano DÁ DIREITO (a promessa comercial)
RECURSOS_ENTREGUES  // o que o sistema JÁ FAZ de verdade
```

E duas funções:

```js
planHasResource(plano, chave)      // dá direito E está pronto  -> libera o recurso
planPromisesResource(plano, chave) // dá direito, pronto ou não -> usado na vitrine
```

Nenhuma tela deve perguntar "o plano é MAX?". Deve perguntar "este plano tem
`logoNoBoleto`?". Foi assim que a logo do condomínio no boleto ficou: `planAllowsCustomLogo()`
hoje é só `planHasResource(nome, 'logoNoBoleto')`.

**Como ligar um recurso na v1.10:** termine a funcionalidade e acrescente a chave em
`RECURSOS_ENTREGUES`. Todas as telas que perguntam por ela liberam de uma vez.

| Chave | ONE | PRO | MAX | Pronto hoje |
| --- | :-: | :-: | :-: | :-: |
| `documentos` | ✔ | ✔ | ✔ | ✔ |
| `boletoProprio` | ✔ | ✔ | ✔ | ✔ |
| `notificacaoApp` | ✔ | ✔ | ✔ | ✔ |
| `notificacaoEmail` | ✔ | ✔ | ✔ | ✔ |
| `notificacaoWhatsapp` | | ✔ | ✔ | falta ligar a conta da Meta |
| `pixAutomatico` | | ✔ | ✔ | **v1.10** |
| `baixaAutomatica` | | ✔ | ✔ | **v1.10** |
| `logoNoBoleto` | | | ✔ | ✔ |
| `boletoPersonalizado` | | | ✔ | v1.10+ |
| `faturaAutomaticaWhatsapp` | | | ✔ | v1.10+ |
| `atendimentoPrioritario` | | | ✔ | v1.10+ |

(Parceria tem tudo o que o MAX tem.)

---

## 2. Cobrança da assinatura: onde o provedor entra

Hoje o síndico escolhe o plano em **Meu perfil → Meu plano → Melhorar meu plano** e fala com a
TSCBr pelo WhatsApp. Quem ativa é a administração da plataforma. Nada disso quebra quando o
pagamento entrar: o caminho do WhatsApp continua como reserva.

### 2.1 O que liga o pagamento

Duas variáveis de ambiente (`.env.example`, seção "ASSINATURA / PAGAMENTO"):

```
VITE_ASSINATURA_PROVEDOR=mercadopago      # ou asaas, pagarme, stripe
VITE_ASSINATURA_CHECKOUT_URL=https://...  # endereço do checkout
ASSINATURA_WEBHOOK_SECRET=...             # só no backend, nunca com prefixo VITE_
```

Com as duas primeiras preenchidas, o botão **"Quero o plano X"** passa sozinho a abrir o
checkout em vez do WhatsApp, já levando plano, valor em centavos, id e nome do condomínio
(`src/lib/assinatura.js` → `buildCheckoutUrl`). Vazio = continua no WhatsApp. Nenhuma tela muda.

### 2.2 Onde o retorno do provedor é guardado

Tabela `public.assinatura_eventos`, criada no SQL `2026-09-28`:

| Coluna | Para que serve |
| --- | --- |
| `condominium_id` | de quem é a assinatura |
| `provedor` | `mercadopago`, `asaas`, `stripe`… |
| `assinatura_externa_id` / `cobranca_externa_id` | identificadores do lado do provedor |
| `evento` | `pagamento.aprovado`, `assinatura.cancelada`… |
| `plano`, `valor_centavos` | o que foi contratado |
| `payload` | corpo cru recebido, para auditoria |
| `chave_idempotencia` | o mesmo webhook não é processado duas vezes |
| `processado_em` | quando a rotina aplicou o efeito |

A tabela tem RLS ligada e **nenhuma política**: só o backend (service role) alcança. Nem
síndico nem morador conseguem ler.

**Nunca gravar no `payload`** número de cartão, token do provedor ou segredo de webhook.

### 2.3 Situação do plano no condomínio

O estado do plano continua em `condominiums.metadata` — é assim que o sistema já funciona.
O provedor entra num ramo próprio, `metadata.assinatura`, para não misturar com as datas de
teste e de vencimento:

```js
readAssinatura(metadata)                 // lê { provedor, assinaturaExternaId, status, ... }
buildAssinaturaMetadata(metadata, patch) // escreve sem apagar plano, datas e vencimento
statusDoEvento('pagamento.aprovado')     // -> 'active'
```

### 2.4 O que falta construir na v1.10

1. **Rota de webhook** (`api/_platform/assinatura/webhook.js`, entrando no router de
   `platform`, sem gastar função nova na Vercel):
   - conferir a assinatura do provedor com `ASSINATURA_WEBHOOK_SECRET` **antes** de qualquer
     coisa;
   - gravar em `assinatura_eventos` usando `chave_idempotencia`;
   - traduzir com `statusDoEvento()` e aplicar em `condominiums.metadata` com
     `activatePlanMetadata()` (que já existe) + `buildAssinaturaMetadata()`;
   - responder 200 rápido; qualquer processamento pesado fica para depois.
2. **Tela da plataforma** mostrando os últimos eventos do condomínio (Condomínios → perfil).
3. **Pix automático no boleto** (`pixAutomatico`): gerar a chave e o QR Code a partir dos dados
   bancários do condomínio, no lugar da imagem enviada pelo síndico.
4. **Baixa automática** (`baixaAutomatica`): casar o pagamento recebido com a cobrança aberta.

### 2.5 Ao escolher o provedor, conferir

- Aceita **assinatura recorrente** em Pix e cartão, com webhook de renovação.
- Manda **evento assinado** (HMAC ou certificado) — sem isso qualquer um forja um pagamento.
- Permite **valor por plano** (R$ 49,90 / R$ 65,90 / R$ 89,90) sem contrato novo a cada mudança.
- Taxa por transação e prazo de repasse compatíveis com a mensalidade.
- Emite nota ou relatório fechado por mês, para a contabilidade da TSCBr.
