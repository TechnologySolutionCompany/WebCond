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

- Projeto novo: todo o `schema.sql`.
- Projeto que já tem dados: todo o `schema_updates.sql`.

Confira se existem as tabelas `condominiums`, `profiles`, `solicitacoes_cadastro`, `cobrancas`, `avisos`,
`documentos`, `ocorrencias_predio`, `app_health`, os buckets privados `documentos` e `cobrancas`, e RLS
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

Regras da `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS, acesso total ao banco):

- Obrigatória para login por CPF/CNPJ, cadastro de condomínio e gestão de usuários pelo painel.
- Pode ficar no `.env` local (os scripts de manutenção precisam dela), mas **nunca** commitada.
- Nunca com prefixo `VITE_` — isso a colocaria no bundle do navegador.
- Sem aspas e sem espaços ao redor do `=`.

As variáveis `NEXT_PUBLIC_SUPABASE_*` são nomes alternativos aceitos pelo backend; não são necessárias.

---

## 3. Vercel

1. **Add New > Project**, importe o repositório do GitHub.
   Em **Settings > Git > Production Branch**, use `main`. A `master` do GitHub é uma versão antiga e sem relação com esta.
2. Cadastre as variáveis da seção 2 em **Settings > Environment Variables**.
3. Deploy. Cada push na branch de produção gera um novo deploy automaticamente.

O `vercel.json` já define:

- Rewrites de SPA para `/admin`, `/platform` e `/morador`.
- Headers de segurança (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
  Se passar a carregar recursos de outro domínio, inclua-o na CSP.
- Função `render-pdf` com 1024 MB, 30 s e o binário do Chromium incluído.

Domínio próprio: **Settings > Domains** (SSL automático).

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
5. Síndico cadastra moradores em `/admin > Moradores`; o sistema gera uma senha temporária para cada um.
6. Morador entra com CPF + senha temporária e acessa `/morador`.
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

Checklist antes de publicar:

- [ ] `git ls-files | grep -i env` só mostra `.env.example`.
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
- `npm run supabase:audit` gera `SUPABASE_AUDIT.md` com inconsistências de perfis. **O relatório contém
  CPF, e-mail e WhatsApp reais**: está no `.gitignore`, não compartilhe e apague após o uso.
- `npm run supabase:clear-registrations` apaga cadastros — destrutivo, use só em ambiente de teste.

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
