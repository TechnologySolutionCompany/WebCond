# Deploy do WebCond

Guia único de configuração do Supabase, deploy na Vercel e operação. Substitui os antigos
`DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_README.md`, `QUICK_START_DEPLOY.md`, `PRE_DEPLOYMENT_CHECKLIST.md`,
`ENV_SETUP.md` e `SUPABASE_SETUP.md`.

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite (estático na Vercel) |
| Backend | Funções serverless em `api/` (Vercel) |
| Banco | Supabase Postgres com RLS |
| Auth | Supabase Auth — login por CPF/CNPJ + senha |
| Arquivos | Supabase Storage, buckets privados `documentos` e `cobrancas` |
| PDF de cobrança | `puppeteer-core` + `@sparticuz/chromium` (em `api/admin/billing/render-pdf.js`) |

Perfis: `PLATFORM_ADMIN` (`/platform`), `ADMIN_CONDOMINIUM` (síndico, `/admin`), `contador` (`/admin`, só relatórios) e `RESIDENT` (morador, `/morador`).

Pré-requisitos: Node.js 24.x (fixado em `engines`), contas no Supabase e na Vercel, repositório no GitHub.

---

## 1. Supabase

### 1.1 Projeto e credenciais

1. Crie o projeto em https://supabase.com/dashboard (região São Paulo, senha do banco forte).
2. Em **Project Settings > API**, copie **Project URL**, **anon/public key** e **service_role key**.

### 1.2 Schema

No **SQL Editor**, execute:

- Projeto novo: todo o `sql/base/schema.sql`.
- Projeto que já tem dados: todo o `sql/base/schema_updates.sql`.
- Depois, em ordem, os arquivos da pasta `sql/` que ainda não foram aplicados (cada um pode ser executado
  de novo sem risco):
  1. `2026-09-19_unidades_e_limite_documentos.sql`
  2. `2026-09-20_vinculos_e_cobranca_por_unidade.sql`
  3. `2026-09-21_plano_vencido_somente_leitura.sql`
  4. `2026-09-22_seguranca_parceria_avisos.sql`
  5. `2026-09-23_importacao_de_unidades.sql`
  6. `2026-09-24_autocadastro_por_link.sql`
  7. `2026-09-25_perfil_suporte_presenca.sql`
  8. `2026-09-26_avisos_equipe_notificacoes.sql`
  9. `2026-09-27_suporte_chat_logo_condominio.sql`
  10. `2026-09-28_limpeza_seguranca_e_plano_pro.sql` — **obrigatório.** Remove a view
      `public.condominios`, que entregava (e deixava alterar) os dados de todos os condomínios
      sem login, limpa dados vencidos e cria o espaço da assinatura. Veja
      `docs/seguranca-v1.09A3.md`.
  11. `2026-09-29_avisos_do_painel_supabase.sql` — responde aos avisos do verificador do painel
      do Supabase (funcoes de gatilho fora da API, search_path fixo, bucket de logos sem
      listagem). Traz um teste dentro da propria transacao: se algo falhar, nada e aplicado.

Em **Authentication > Sign In / Providers**, desative **Allow new users to sign up**. Todas as contas são
criadas pelo backend (service role); o cadastro público do Supabase Auth não é usado pelo sistema.

Confira se existem as tabelas `condominiums`, `profiles`, `solicitacoes_cadastro`, `cobrancas`, `avisos`,
`documentos`, `ocorrencias_predio`, `app_health`, `unidades`, `unidade_vinculos`, os buckets privados `documentos` e `cobrancas`, e RLS
habilitado em todas as tabelas:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

### 1.3 Realtime

Habilite Realtime (publication) para `public.solicitacoes_cadastro`. Sem isso o contador de solicitações
do painel admin não atualiza sozinho.

### 1.4 Conta PLATFORM_ADMIN

Opção A — script (usa o `.env` local):

```bash
npm run supabase:create-platform-admin
```

Opção B — manual: crie o usuário em **Authentication > Users** e rode:

```sql
update public.profiles
set role = 'PLATFORM_ADMIN',
    ativo = true,
    nome = 'Seu Nome',
    cpf = '00000000000',
    condominium_id = null,
    condominio_id = null,
    updated_at = now()
where email = 'seu-email@dominio.com';
```

Esse usuário entra com CPF + senha e cai em `/platform`.

---

## 2. Variáveis de ambiente

Modelo em `.env.example`. Localmente, copie para `.env` (é o arquivo que o Vite e os scripts de
`scripts/` leem; ele está no `.gitignore`).

| Variável | Onde é usada | Vercel: escopos |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Production, Preview, Development |
| `SUPABASE_URL` | `api/` e `scripts/` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | `api/` e `scripts/` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/` e `scripts/` | Production, Preview — **não** Development |
| `CHROME_EXECUTABLE_PATH` | Opcional, só local: caminho do Chrome para gerar PDF | — |
| `VITE_VAPID_PUBLIC_KEY` | Frontend e `api/` (notificação no aparelho) | Production, Preview, Development |
| `VAPID_PRIVATE_KEY` | `api/` (assina as notificações) | Production, Preview — **não** Development |
| `VAPID_SUBJECT` | `api/` (contato exigido pelos serviços de push) | Production, Preview |
| `APP_URL` | `api/` (link dos e-mails) | Production |
| `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM` | `api/` — opcional: liga o e-mail | Production |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | `api/` — opcional: liga o WhatsApp | Production |
| `VITE_ASSINATURA_PROVEDOR`, `VITE_ASSINATURA_CHECKOUT_URL` | Frontend — opcional: liga o pagamento da assinatura (v1.10) | Production |
| `ASSINATURA_WEBHOOK_SECRET` | `api/` — opcional: confere a assinatura do webhook do provedor | Production |

Regras da `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS, acesso total ao banco):

- Obrigatória para login por CPF/CNPJ, cadastro de condomínio e gestão de usuários pelo painel.
- Pode ficar no `.env` local (os scripts de manutenção precisam dela), mas **nunca** commitada.
- Nunca com prefixo `VITE_` — isso a colocaria no bundle do navegador.
- Sem aspas e sem espaços ao redor do `=`.

As variáveis `NEXT_PUBLIC_SUPABASE_*` são nomes alternativos aceitos pelo backend; não são necessárias.

---

## 3. Vercel

Projeto em produção: **webcond** (https://webcond.vercel.app), conectado ao repositório e publicando
sozinho a cada push na `main`.

1. **Add New > Project**, importe o repositório do GitHub.
   Em **Settings > Git > Production Branch**, use `main`. A `master` do GitHub é uma versão antiga e sem relação com esta.
2. Cadastre as variáveis da seção 2 em **Settings > Environment Variables**.
3. Deploy. Cada push na branch de produção gera um novo deploy automaticamente.

O `vercel.json` já define:

- Rewrites de SPA para `/admin`, `/platform` e `/morador`.
- Headers de segurança (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
  Se passar a carregar recursos de outro domínio, inclua-o na CSP.
- Função `render-pdf` com 30 s e o binário do Chromium incluído.
- `regions: ["gru1"]`: as funções rodam em São Paulo, perto do Supabase. Em Washington (padrão) o
  banco respondia em ~230 ms; em São Paulo, ~70 ms.

Domínio próprio: **Settings > Domains** (SSL automático).

### 3.1 Rotas da API e o limite do plano Hobby

O plano Hobby aceita no máximo **12 Serverless Functions**, e o projeto tem 16 rotas. Por isso cada área
tem uma função única que distribui as chamadas (`api/<area>/[...segments].js` + `api/_lib/router.js`),
e os módulos de cada rota ficam em `api/_auth/`, `api/_admin/`, `api/_platform/` e `api/_tenant/`
(pastas com `_` não viram funções). São 6 funções no total, incluindo `render-pdf`, que fica separada
por carregar o Chromium.

Na Vercel o roteador só captura **um** nível de caminho, então os endereços têm um segmento só depois da
área: `/api/admin/units-save`, `/api/platform/condominiums-list`. Ao criar uma rota nova: coloque o
módulo em `api/_<area>/`, registre no roteador da área e em `apiModules` no `vite.config.js`.

---

### 3.2 Importação de unidades por planilha

O fluxo completo (modelo .xlsx, tela, validações, gravação e testes) está em
[docs/importacao-unidades.md](docs/importacao-unidades.md). A tela fica pronta no codigo, mas o botao
esta fora do menu por decisao de produto.

---

### 3.3 Auto-cadastro do morador por link

O sindico gera um link, o morador preenche os proprios dados e escolhe a senha, e o sindico aprova.
Detalhes em [docs/autocadastro-por-link.md](docs/autocadastro-por-link.md).

---

### 3.4 Notificações (aparelho, e-mail, WhatsApp) e equipe de suporte

Aviso publicado ou cobrança lançada chega no celular/computador do morador (Web Push), e opcionalmente
por e-mail (Resend) e WhatsApp (Meta). Como funciona, custos e como ligar cada canal:
[docs/notificacoes.md](docs/notificacoes.md). A equipe de suporte (acesso limitado ao painel da
plataforma) é criada em **Plataforma → Equipe de suporte**.

O chamado de suporte é uma conversa (síndico ↔ equipe), organizada em um quadro de três colunas.
A logo do condomínio fica no bucket `condominios` (leitura pública, gravação só do admin da plataforma)
e entra no boleto nos planos MAX e Parceria.

---

## 4. Desenvolvimento local

```bash
npm install
cp .env.example .env    # preencha os valores
npm run dev             # http://localhost:5173
npm run lint
npm run build
npm run validate-deploy # confere arquivos, .env, .gitignore e build
npm run smoke-test      # somente leitura: testa API, tabelas, buckets e PLATFORM_ADMIN no Supabase do .env
```

- No PowerShell, se o `npm` for bloqueado pela execution policy, use `npm.cmd run dev`.
- Geração de PDF local usa o Google Chrome instalado. Sem Chrome, defina `CHROME_EXECUTABLE_PATH`
  (Edge também funciona).

---

## 5. Primeiro uso e teste de ponta a ponta

1. `PLATFORM_ADMIN` entra por CPF e acessa `/platform`.
2. Na landing, **Cadastrar condomínio** (documento do condomínio: CNPJ, ou CPF do síndico se ainda não
   houver CNPJ). O condomínio nasce `pending`.
3. `PLATFORM_ADMIN` aprova em `/platform > Condomínios`. Antes disso o síndico autentica, mas o acesso é bloqueado.
4. Síndico entra por CPF ou pelo CNPJ do condomínio e acessa `/admin`.
5. Síndico cadastra as unidades em `/admin > Unidades` (proprietário e, se alugada, inquilino, com senha).
6. Proprietário/inquilino entra com CPF + senha e acessa `/morador`.
7. Síndico cria uma cobrança com Pix/anexo/boleto; morador vê a cobrança, QR Code/código Pix e documentos.
8. Síndico marca o pagamento como recebido.
9. Bloqueie o condomínio em `/platform` e confirme que síndico e moradores perdem o acesso.
10. `GET /api/health` responde 200.

---

## 6. Segurança em produção

Já implementado no código:

- RLS em todas as tabelas; `service_role` só no backend.
- Rotas `api/` de escrita rejeitam requisições de navegador vindas de outra origem.
- Rate limit em login (20 tentativas / 15 min por IP e 10 por documento) e em cadastro de condomínio
  (5 / hora por IP). É em memória, por instância serverless: reduz força bruta, mas não substitui um
  limite global (ex.: Vercel Firewall ou tabela no banco) se o tráfego crescer.
- Valores de usuário em filtros `.or()` do PostgREST são escapados com `quoteFilterValue`.
- Buckets com limite de tamanho e de tipo: nenhum aceita `.html` ou `.svg` (executam script).

**Nunca crie view no schema `public` sem `security_invoker = on`.** View roda com os direitos de
quem a criou e **ignora a RLS** — foi assim que a view antiga `condominios` passou a entregar os
dados de todos os condomínios para quem tinha só a chave pública do navegador (corrigido em
`sql/2026-09-28`). O grupo "Superfície pública" do `npm run security-test` agora vigia isso.

Checklist antes de publicar:

- [ ] `git ls-files | grep -i env` só mostra `.env.example`.
- [ ] `npm run security-test` sem nenhuma falha, incluindo o grupo "Superfície pública".
- [ ] `npm run lint` e `npm run build` sem erros.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` fora do escopo Development na Vercel.
- [ ] Backups automáticos habilitados no Supabase (plano pago).

### Rotação de chaves (a cada 3–6 meses)

1. Supabase **Settings > API**, gere a nova chave.
2. Atualize na Vercel e no `.env` local, faça deploy e valide o login.
3. Só então revogue a antiga.

### Se a `service_role` vazar

1. Rotacione imediatamente no Supabase.
2. Atualize a Vercel e faça deploy.
3. Revise os logs do Supabase em busca de atividade suspeita.
4. Se vazou via Git, a chave antiga continua no histórico: rotacionar é obrigatório, apagar o commit não basta.

A `anon key` é pública por natureza (o RLS protege os dados), mas rotacione se houver suspeita de abuso.

---

## 7. Manutenção

- Logs: Vercel **Deployments > Logs**; Supabase **Logs**.
- `npm run smoke-test`: checagem somente leitura do backend contra o Supabase do `.env`.
- `/platform > Status`: saúde de banco, login, arquivos e rotinas, com tempo de resposta.
- Avisos são apagados automaticamente 30 dias após o envio (a cada novo aviso e, se a extensão `pg_cron`
  estiver habilitada, diariamente às 03:00 UTC).

## 8. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Erro de conexão com Supabase no navegador | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ausentes ou erradas (exigem novo deploy após alterar) |
| Login por CPF/CNPJ retorna 503 | `SUPABASE_SERVICE_ROLE_KEY` ausente ou com placeholder no ambiente |
| Login retorna 429 | Rate limit atingido; aguarde 15 minutos |
| API retorna 403 "Origem não permitida" | Chamada feita de outro domínio; as rotas só aceitam o próprio site |
| 404 em `/api/...` | Arquivo ausente em `api/` ou deploy desatualizado |
| Upload de arquivo falha | Buckets `documentos`/`cobrancas` inexistentes ou policy de Storage |
| Recurso bloqueado no console (CSP) | Domínio externo não listado na CSP do `vercel.json` |
| PDF falha localmente | Chrome não instalado; defina `CHROME_EXECUTABLE_PATH` |
