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

---

## 7. Avisos do painel do Supabase (23/09/2026)

O verificador do painel (*Advisors > Security*) apontou 40 avisos, todos de nível **WARN**
(nenhum ERROR). Eles foram conferidos um a um. Resumo:

| Aviso | Quantos | O que é | Decisão |
| --- | :-: | --- | --- |
| Function Search Path Mutable | 3 | função sem `search_path` fixo | corrigido no SQL `2026-09-29` |
| Public Bucket Allows Listing | 1 | bucket de logos podia ser **listado** | corrigido no SQL `2026-09-29` |
| Public/Signed-In Can Execute SECURITY DEFINER | 35 | funções publicadas na API | 8 corrigidas, 27 são a própria RLS (abaixo) |
| Leaked Password Protection Disabled | 1 | senha vazada não é barrada | ligar no painel (abaixo) |

### 7.1 Corrigido no SQL `2026-09-29`

**Funções de gatilho fora da API.** Oito funções (`set_updated_at`, `handle_new_user`,
`protect_profile_columns`, `enforce_document_plan_limit`, `purge_expired_avisos_trigger`,
`suporte_primeira_mensagem`, `suporte_atualiza_chamado`, `sync_condominium_language_fields`)
só existem para rodar dentro de um gatilho. Chamar pela API já não funcionava — o Postgres
recusa —, mas elas apareciam na lista de funções publicadas. A permissão foi retirada.

O banco confere a permissão na hora de **criar** o gatilho, não a cada vez que ele dispara,
então nada para de funcionar. Mesmo assim, o arquivo traz um **teste dentro da própria
transação**: monta uma tabela temporária com o gatilho real, vira um usuário comum e faz um
update. Se o gatilho recusar, o arquivo inteiro é desfeito e o banco não muda.

**`search_path` fixo** em `set_updated_at` e `sync_condominium_language_fields` (as duas mais
antigas do projeto; as demais já nasciam com ele). Sem isso, quem conseguisse criar um schema
na frente do `public` poderia fazer a função chamar outra coisa no lugar do que ela espera.

**`get_my_role()` removida.** Não está em nenhum arquivo do projeto, nenhuma tela chama e
nenhuma política usa — sobrou de um teste feito no painel. Se alguma política depender dela, o
`drop` falha, ela fica e só o `search_path` é corrigido.

**Bucket de logos: abrir sim, listar não.** O bucket `condominios` é público porque a logo
precisa aparecer no boleto e no perfil sem login. Só que a política de leitura permitia
**listar o bucket inteiro**, ou seja, descobrir todos os condomínios cadastrados pelo nome da
pasta. Bucket público não precisa dessa política para entregar o arquivo: o endereço
`/storage/v1/object/public/...` não passa por RLS. A política foi retirada; gravar, trocar e
apagar continuam só com o administrador da plataforma.

Duas conferências novas entraram no `npm run security-test`: a logo precisa **abrir** sem
login, e o bucket **não** pode ser listado sem login.

### 7.2 Aceito de propósito: as funções da própria RLS

Os 27 avisos restantes são as funções que **as políticas de RLS usam para decidir quem vê o
quê**: `is_platform_admin()`, `is_condominium_admin()`, `current_user_condominium_id()`,
`same_condominium()`, `storage_path_in_my_condominium()`, `my_unit_people()`,
`registrar_presenca()` e companhia.

Por que ficam como estão:

- **Não entregam dado de ninguém.** Elas respondem sobre quem está chamando. Testado no banco
  real, sem login: `is_admin` → `false`, `is_platform_admin` → `false`, `current_user_role` →
  `null`, `current_user_condominium_id` → `null`. Com login, cada um recebe o próprio dado.
- **Tirar a permissão pode derrubar a RLS.** As políticas chamam essas funções em nome de quem
  está consultando. Sem permissão de execução, uma consulta legítima pode passar a responder
  "permissão negada" em vez de filtrar — trocar um risco inexistente por uma quebra real.
- **O caminho definitivo é outro:** mover as funções para um schema fora da API (ex.: `private`)
  e reapontar todas as políticas. É uma mudança grande, para fazer com calma e com o teste de
  segurança rodando antes e depois. Fica anotado para a v1.10.

Enquanto isso, o `npm run security-test` já cobre o que importa de verdade: nenhuma das 16
tabelas responde com dado para quem não fez login, e nenhum condomínio enxerga o outro.

### 7.3 Para ligar no painel: proteção contra senha vazada

**Authentication > Sign In / Providers > Password > "Prevent use of leaked passwords".**

O Supabase passa a comparar a senha escolhida com a base do HaveIBeenPwned (sem enviar a senha
inteira, só um pedaço do código dela) e recusa senha que já apareceu em vazamento. Vale para
cadastro de condomínio, cadastro de morador, troca de senha e contas de suporte.

O código já foi preparado para isso: a recusa do Supabase vem em inglês, e agora todas as telas
que definem senha respondem **"Esta senha aparece em vazamentos conhecidos ou é fácil de
adivinhar. Escolha outra senha."**, com status 400 em vez de erro genérico. Sem essa preparação,
o síndico veria uma mensagem em inglês ou um "não foi possível criar a conta" sem explicação.
