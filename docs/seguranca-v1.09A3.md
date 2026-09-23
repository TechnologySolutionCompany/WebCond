# Auditoria de segurança — v1.09A3

Revisão feita em 22/09/2026 contra o **banco real** (o mesmo que está no ar) e contra todo o
código versionado. O que segue é o resultado completo: o que estava errado, o que foi corrigido
e o que foi conferido e está limpo.

---

## Resumo

| Gravidade | Achado | Situação |
| --- | --- | --- |
| **Crítica** | View `public.condominios` entregava (e deixava alterar) os dados de todos os condomínios sem login | Corrigida no SQL `2026-09-28` |
| Média | Buckets `documentos` e `cobrancas` sem limite de tamanho e de tipo de arquivo | Corrigida no SQL `2026-09-28` |
| Baixa | Tabela de teste `public.webcond` esquecida no banco | Removida no SQL `2026-09-28` |
| Baixa | Regra antiga do banco adotava um condomínio quando o registro chegava sem um | Corrigida nos SQL `2026-09-27` e `2026-09-28` |

Nenhuma senha, chave ou segredo foi encontrado em arquivo versionado, no histórico do Git ou no
site publicado. Detalhe no final.

---

## 1. Crítica — qualquer visitante lia e alterava os dados dos condomínios

### O que foi encontrado

Existia no banco uma **view** chamada `public.condominios`, do tempo em que as tabelas tinham
nome em português. Nenhuma parte do sistema usa essa view — ela só tinha ficado lá.

O problema é uma regra do PostgreSQL: **view não respeita RLS**. A view roda com os direitos de
quem a criou, então as regras que protegem a tabela `condominiums` simplesmente não valiam para
quem entrasse por ela.

A chave `anon` do Supabase fica dentro do JavaScript do site — qualquer pessoa que abra o
WebCond no navegador tem essa chave. Com ela e mais nada, era possível:

```
GET    /rest/v1/condominios   -> nome, CNPJ, endereço, WhatsApp, chave Pix,
                                 dados bancários e metadados de TODOS os condomínios
PATCH  /rest/v1/condominios   -> alterar qualquer campo (inclusive a chave Pix)
DELETE /rest/v1/condominios   -> apagar condomínios
```

### Como foi confirmado

Consulta feita ao banco de produção usando **apenas a chave pública**, sem nenhum login:

```
ANON  condominios   -> 200  3 linha(s)
      colunas: id, nome, endereco, chave_pix, created_at, updated_at, name, slug, cnpj,
               address, zip_code, whatsapp, unit_count, bank_details, pix_key, status,
               is_default, metadata
      cnpj preenchido em 3/3 · pix_key 3/3 · bank_details 3/3 · whatsapp 3/3

ANON  condominiums  -> 200  0 linha(s)   (a tabela verdadeira estava protegida, como esperado)

PATCH  view condominios -> 200  permitido
DELETE view condominios -> 200  permitido
```

Os testes de alteração e de exclusão foram feitos com um filtro que **não casa com nenhuma
linha** (`id=eq.00000000-...`): eles provam a permissão sem tocar em dado nenhum. Nada foi
alterado ou apagado no banco durante a auditoria.

### Por que era grave

- **Vazamento de dados**: CNPJ, endereço, contato e dados bancários dos condomínios clientes.
- **Desvio de pagamento**: trocar a `pix_key` de um condomínio faria os boletos seguintes
  saírem com a chave Pix de outra pessoa. O síndico não veria diferença no layout.
- **Destruição**: apagar um condomínio pela view.

### Correção

`drop view if exists public.condominios;` — seção 1 do arquivo
`sql/2026-09-28_limpeza_seguranca_e_plano_pro.sql`. A tabela `public.condominiums` continua
protegida por RLS, como sempre esteve, e nenhuma tela usa a view.

### Para não voltar a acontecer

Entrou no `npm run security-test` um grupo novo, **"Superfície pública"**, que a cada rodada:

- tenta ler, alterar e apagar pela view antiga (tem de falhar nos três);
- varre as 16 tabelas do sistema com a chave pública e exige zero linha em todas;
- confere que a tabela de teste não existe mais;
- confere limite e tipo de arquivo em todos os buckets.

Qualquer view ou tabela nova que escape da RLS cai nesse teste.

---

## 2. Média — arquivos sem limite de tamanho nem de tipo

Os buckets `documentos` e `cobrancas` estavam sem `file_size_limit` e sem
`allowed_mime_types`. Quem tem acesso de síndico podia enviar arquivo de qualquer tamanho
(custo de armazenamento sem teto) e de **qualquer tipo**, inclusive `.html` e `.svg`.

O risco do `.html`/`.svg`: quando o arquivo é aberto pelo link, o navegador executa o script que
estiver dentro dele, no domínio do Supabase — com a sessão de quem abriu.

**Correção** (seção 4 do SQL `2026-09-28`):

| Bucket | Limite | Tipos aceitos |
| --- | --- | --- |
| `documentos` | 20 MB | PDF, PNG, JPG, WEBP, TXT, CSV, Word, Excel, ZIP |
| `cobrancas` | 10 MB | PDF, PNG, JPG, WEBP |
| `suporte` | 5 MB (já tinha) | PDF, PNG, JPG, WEBP |
| `condominios` | 2 MB (já tinha) | PNG, JPG, WEBP |

Arquivos já enviados continuam onde estão: o limite vale para o que entrar daqui para a frente.
Se algum condomínio precisar enviar um tipo fora da lista, é uma linha para acrescentar.

---

## 3. Baixa — tabela de teste esquecida

`public.webcond` ("projeto de webcond"), com `id` e `created_at`, **zero linhas**, nenhuma
referência no código. A RLS estava ligada e sem política, então ninguém conseguia ler nem
gravar — mas tabela sem dono e sem uso é superfície à toa. Removida.

---

## 4. Baixa — a regra que adotava um condomínio sozinha

A função `sync_legacy_condominium_id()` existe para manter em sincronia as duas colunas de
condomínio que o banco carrega desde o começo (`condominium_id`, em inglês, e `condominio_id`,
o nome antigo). Em produção ela fazia mais do que isso: quando o registro chegava **sem**
condomínio, escolhia um.

Foi assim que as contas de suporte nasceram presas a um condomínio e enxergavam os dados dele —
o que apareceu nos 11 testes que falharam na rodada anterior e foi corrigido no SQL
`2026-09-27`. O `2026-09-28` termina o serviço: a função agora **só espelha** as duas colunas, e
a função `default_condominium_id()` (a que escolhia o condomínio) é removida.

Nenhuma tela depende do antigo comportamento: o app sempre informa o condomínio
(`src/lib/tenant.js` → `withTenantFields`) e a RLS recusa o registro se o condomínio estiver
errado.

---

## 5. O que foi conferido e está correto

### Segredos

| Onde | Resultado |
| --- | --- |
| Arquivos versionados | nenhuma chave real; `.env.example` só tem exemplos |
| Histórico completo do Git (todos os commits) | nenhuma chave `re_`, `sk_`, `SG.`, `EAA`, `AKIA`, JWT ou chave privada |
| `.env` e `.env.local` | fora do Git (`.gitignore`) e fora do deploy (`.vercelignore`) |
| Site publicado (`dist/`) | nenhuma `service_role`, nenhuma chave VAPID privada, nenhuma `re_` |
| Variáveis que vão para o navegador | só `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_PLAN_UPGRADE_URL`, `VITE_TTL_DAYS` — todas públicas por natureza |
| Chave do Resend (`re_...`) | **não existe ainda**; o canal de e-mail está desligado. Quando criar a conta, a chave vai só na Vercel, nunca no código |

Observação sobre a chave `anon`: ela **é pública de propósito** e fica visível no site. Quem
protege os dados é a RLS — e é exatamente por isso que o achado nº 1 era grave.

### Código

| Item | Resultado |
| --- | --- |
| `console.log` com senha, token, CPF ou chave | nenhum (0 `console.log` em `src/` e `api/`) |
| Senha em texto puro no banco | nenhuma; autenticação sempre pelo Supabase Auth |
| XSS (`innerHTML`, `dangerouslySetInnerHTML`) | nenhum uso |
| Injeção em filtros do PostgREST | valores de usuário passam por `quoteFilterValue`; o resto são UUIDs vindos do perfil autenticado |
| Rotas da API sem verificação de acesso | nenhuma; as públicas (login, cadastro, health) são públicas de propósito e têm limite por IP |
| Limite de tentativas de login | 20 por IP e 10 por documento a cada 15 minutos |
| Requisição de outra origem | bloqueada por `rejectForeignOrigin` |
| Cabeçalhos do site | HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` — todos presentes no `vercel.json` |

### Banco

| Item | Resultado |
| --- | --- |
| Leitura sem login nas 16 tabelas do sistema | zero linha em todas (só `app_health`, que é o "estou vivo" e não tem dado nenhum) |
| Escrita sem login | recusada em todas; a brecha antiga de cadastro direto já tinha sido fechada em `2026-09-24` |
| Buckets privados | `documentos`, `cobrancas` e `suporte` privados; só `condominios` (logos) é público, por decisão |
| Funções de apoio da RLS | respondem "falso"/"nulo" para quem não fez login |

---

## 6. Recomendações (não bloqueiam o deploy)

1. **Nunca criar view no schema `public`** sem `security_invoker = on`. Foi essa a origem do
   achado nº 1. Se precisar de uma view, crie com `with (security_invoker = on)` — aí ela passa
   a respeitar a RLS de quem consulta.
2. **Rodar `npm run security-test` antes de cada publicação.** O grupo "Superfície pública"
   agora pega esse tipo de erro sozinho.
3. **Girar a chave `service_role`** se algum dia ela for colada em chat, e-mail ou print.
   O passo a passo está no `DEPLOY.md`, seção "Se a `service_role` vazar".
4. **Ao ligar o e-mail (Resend) e o WhatsApp (Meta)**, colocar as chaves só na Vercel, em
   *Environment Variables*, e nunca no `.env` versionado.
5. **Quando escolher o provedor de pagamento**, conferir a assinatura do webhook antes de
   confiar no evento — o contrato está em `docs/plano-pro-v1.10.md`.
