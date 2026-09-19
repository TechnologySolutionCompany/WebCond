# Resumo do Projeto WebCond

```yaml
arquivo: resumo.md
projeto: WebCond
tipo: SaaS multi-condominio para gestao condominial
gerado_em: 2026-06-09
formato: Markdown estruturado para leitura por IA e humanos
idioma: pt-BR sem acentos para manter ASCII simples
```

## 1. Visao Geral

WebCond e uma aplicacao web para administracao de condominios em modelo SaaS multi-tenant. O sistema possui:

- Login unico por CPF ou CNPJ + senha.
- Separacao de dados por condominio via `condominium_id`.
- Painel global da plataforma em `/platform`.
- Painel do sindico/administrador em `/admin`.
- Area do morador em `/morador`.
- Cobrancas manuais com Pix, QR Code, PDF de boleto/anexo e confirmacao manual.
- Comunicados, documentos, ocorrencias, moradores e solicitacoes de cadastro.
- Integracao com Supabase para Auth, banco, RLS, Realtime e Storage.
- APIs serverless em `api/`, preparadas para Vercel.

O projeto ja tem codigo para a arquitetura multi-condominio, mas depende da configuracao correta do Supabase antes de rodar os fluxos reais.

## 2. Stack Principal

- Frontend: React 19, Vite 8, React Router 7.
- Backend/API: Vercel Serverless Functions no diretorio `api/`.
- Banco/Auth/Storage: Supabase.
- UI/Icons: CSS proprio e `lucide-react`.
- PDF/boletos: `puppeteer`, `pdf-lib`, template HTML em `src/lib/billingPdfTemplate.js`.
- QR Code Pix: `qrcode`.
- CSV/parsing auxiliar: `papaparse`.
- Lint: ESLint 9.

Scripts importantes em `package.json`:

```bash
npm run dev
npm run build
npm run lint
npm run preview
npm run supabase:audit
npm run supabase:clear-registrations
npm run supabase:create-platform-admin
```

No PowerShell do Windows, se `npm` for bloqueado por policy, usar `npm.cmd run ...`.

## 3. Estrutura de Pastas

```text
api/
  _lib/supabaseAdmin.js              # Clientes Supabase de backend e guards de permissao
  auth/login-cpf.js                  # Login por CPF
  auth/login-cnpj.js                 # Login por CNPJ
  admin/residents/*.js               # CRUD sensivel de moradores/contadores no Auth + profiles
  admin/billing/render-pdf.js        # Gera PDF de boleto com Puppeteer
  platform/condominiums/*.js         # Cadastro/lista/edicao de condominios
  tenant/charge-summary.js           # Resumo de cobrancas por condominio
  health.js                          # Health check backend/Supabase

src/
  App.jsx                            # Rotas principais
  main.jsx                           # Bootstrap React
  pages/Landing.jsx                  # Login e cadastro de condominio
  components/admin/                  # Painel do sindico/admin e contador
  components/morador/                # Area do morador
  components/platform/               # Painel global da plataforma
  components/shared/                 # Sidebar, ProtectedRoute, Toast, graficos/banners
  hooks/                             # Auth, tema, settings, health, presence
  lib/                               # APIs client, tenant, auth, cobrancas, PDF, documentos
  styles/global.css                  # Estilos globais

public/
  logo.png, favicon.svg, manifest.json, sw.js

scripts/
  create-platform-admin.mjs          # Cria/atualiza administrador global
  clear-registrations.mjs            # Limpa cadastros/testes
  supabase-audit-and-sync.mjs        # Auditoria/sincronizacao de dados Supabase

schema.sql                           # Schema completo para Supabase novo
schema_updates.sql                   # Migracao/atualizacao para projeto existente
DEPLOY.md                            # Guia de Supabase, deploy e operacao
architecture.md                      # Prompt/objetivo original de reestruturacao SaaS
vercel.json                          # Rewrites para SPA em /admin, /platform, /morador
```

## 4. Rotas e Areas do App

Arquivo central: `src/App.jsx`.

Rotas:

- `/`: `Landing`, com login por CPF/CNPJ e cadastro de condominio.
- `/platform/*`: `PlatformLayout`, protegido por `platform_admin`.
- `/admin/*`: `AdminLayout`, protegido por `admin` ou `contador`.
- `/morador/*`: `MoradorLayout`, protegido por `morador`.
- `*`: redireciona para `/`.

`vercel.json` reescreve `/admin/:path*`, `/platform/:path*` e `/morador/:path*` para `/`, permitindo SPA routing em deploy Vercel.

## 5. Papeis e Permissoes

Papeis normalizados no frontend em `src/lib/auth.js`:

- `platform_admin`: administrador global da plataforma.
- `admin`: sindico/administrador do condominio.
- `morador`: residente.
- `contador`: papel adicional tecnico para relatorios no painel admin.

Aliases aceitos:

- `ADMIN_CONDOMINIUM`, `admin_condominium`, `administrador_condominio` -> `admin`.
- `RESIDENT`, `resident` -> `morador`.
- `PLATFORM_ADMIN` -> `platform_admin`.

Redirecionamento por papel:

- `platform_admin` -> `/platform`.
- `admin` ou `contador` -> `/admin`.
- outros/residente -> `/morador`.

`ProtectedRoute` valida:

- usuario autenticado;
- perfil carregado;
- ausencia de `authIssue`;
- papel requerido pela rota.

## 6. Autenticacao

O usuario digita CPF ou CNPJ + senha na landing. O Supabase Auth continua usando e-mail internamente.

Fluxo client:

- `src/pages/Landing.jsx` chama `signInWithDocument`.
- `src/lib/authApi.js` escolhe endpoint por tipo de documento:
  - CPF -> `/api/auth/login-cpf`.
  - CNPJ -> `/api/auth/login-cnpj`.
- A API retorna tokens de sessao do Supabase.

Login por CPF:

- Endpoint: `api/auth/login-cpf.js`.
- Busca `profiles.cpf` ativo.
- Exige exatamente um perfil para evitar ambiguidade.
- Usa o e-mail interno do perfil para `supabaseServer.auth.signInWithPassword`.

Login por CNPJ:

- Endpoint: `api/auth/login-cnpj.js`.
- Primeiro tenta perfis `platform_admin` cujo `cpf` contenha o documento informado.
- Depois busca `condominiums.cnpj`.
- Autentica um perfil administrador do condominio associado.

`useAuth`:

- Arquivo: `src/hooks/useAuth.jsx`.
- Carrega sessao atual.
- Busca `profiles`.
- Normaliza role.
- Para usuarios que nao sao `platform_admin`, busca o condominio vinculado.
- Bloqueia acesso quando o condominio esta pendente, rejeitado, bloqueado ou com trial expirado.

## 7. Multi-Tenancy e Isolamento

O multi-tenant e baseado em `condominiums.id`.

Padrao de dados:

- Todas as entidades principais possuem `condominium_id`.
- Tambem existe `condominio_id` como campo legado/compatibilidade.
- Novas escritas devem preencher ambos quando houver contexto de condominio.

Helpers:

- `src/lib/tenant.js`
  - `getProfileCondominiumId(profile)`.
  - `buildTenantOrFilter(condominiumId)`.
  - `applyTenantFilter(query, condominiumId)`.
  - `withTenantFields(payload, condominiumId)`.

RLS no Supabase:

- Usa funcoes SQL como `current_user_condominium_id()`, `is_platform_admin()`, `is_condominium_admin()`, `has_reporting_access()` e `same_condominium(...)`.
- Administrador de condominio acessa dados do proprio condominio.
- Morador acessa os proprios dados/cobrancas e documentos/avisos permitidos.
- `platform_admin` gerencia `condominiums`, mas nao deve acessar dados financeiros de moradores.

## 8. Status do Condominio e Plano

Arquivo: `src/lib/condominiumPlan.js`.

Plano padrao:

- Nome: `Plano Padrao`.
- Valor: `R$ 79,90`.
- Preco em centavos: `7990`.
- Trial: `30` dias.

Status aceitos em `condominiums.status`:

- `pending`
- `active`
- `rejected`
- `blocked`

Regra de acesso:

- `pending`: acesso bloqueado ate aprovacao.
- `rejected`: acesso bloqueado.
- `blocked`: acesso bloqueado manualmente.
- `active` com trial expirado e assinatura nao ativa: status efetivo vira `blocked`, motivo `trial_expired`.
- `active` com `subscription_status = active`: acesso liberado.

## 9. Banco de Dados

Schemas:

- `schema.sql`: criar projeto Supabase novo.
- `schema_updates.sql`: aplicar em projeto existente/migracao.

Tabelas principais:

- `condominiums`
  - dados do condominio: nome, documento CPF/CNPJ em `cnpj`, endereco, WhatsApp, unidades, Pix, banco, status, metadata.
  - indices unicos para slug, documento e condominio default.

- `profiles`
  - perfil vinculado a `auth.users`.
  - campos: role, nome, email, telefone, apartamento, cpf, data_entrada, whatsapp, ativo, observacao, avatar.
  - indices unicos para email lower-case e CPF.

- `solicitacoes_cadastro`
  - solicitacoes de cadastro de moradores.
  - status: `pendente`, `aprovado`, `rejeitado`.

- `cobrancas`
  - cobrancas por morador.
  - campos: descricao, valor, tipo, mes_referencia, vencimento, pago, data_pagamento.
  - campos Pix/anexo/boleto: `pix_qr_code`, `pix_qrcode_url`, `pix_copy_paste_code`, `pix_link`, `pagamento_link`, `pagamento_anexo_url`, `pagamento_anexo_path`, `boleto_url`, `boleto_path`.
  - status moderno: `payment_status` em `PENDING`, `PAID`, `OVERDUE`, `UNDER_REVIEW`, `CANCELLED`.
  - confirmacao: `paid_at`, `confirmed_by`, `receipt_url`.

- `avisos`
  - comunicados do condominio.
  - tipos: `aviso`, `urgente`, `informativo`, `manutencao`.
  - destinatarios: `todos`, `apartamento`, `especifico`.

- `documentos`
  - documentos enviados pelo admin.
  - categorias: `ata`, `regimento`, `contrato`, `financeiro`, `comprovante`, `conta`, `boleto`, `outro`.
  - controla `publico` e `arquivo_path`.

- `ocorrencias_predio`
  - ocorrencias abertas por moradores ou gerenciadas pelo admin.
  - categorias: `geral`, `limpeza`, `estrutura`, `seguranca`, `energia`.
  - status: `aberto`, `em_analise`, `resolvido`.
  - tambem e usada para solicitacoes internas do morador, como confirmacao de pagamento e alteracao cadastral.

- `app_health`
  - tabela simples para health check.

Storage:

- Bucket privado `documentos`.
- Bucket privado `cobrancas`.
- Politicas de storage restringem leitura/escrita conforme papel, condominio e relacionamento com a cobranca/documento.

## 10. Frontend por Area

Landing (`src/pages/Landing.jsx`):

- Login por CPF ou CNPJ.
- Cadastro de novo condominio pelo sindico.
- Valida documento do condominio como CPF ou CNPJ.
- Cria solicitacao de condominio com status `pending`.

Platform (`src/components/platform/`):

- `PlatformLayout`: navega entre painel, condominios e status.
- `PlatformDashboard`: metricas globais.
- `PlatformCondominiums`: lista condominios, filtra/edita status, aprova/rejeita/bloqueia/desbloqueia, edita dados e plano.
- `PlatformStatusPage`: exibe health da plataforma via `/api/health`.

Admin/Sindico (`src/components/admin/`):

- `AdminLayout`: menu principal; se role `contador`, limita navegacao a painel/relatorios.
- `Dashboard`: resumo de moradores, cobrancas, avisos e ocorrencias.
- `Moradores`: gerencia perfis de moradores/contadores, status de moradia e notificacoes.
- `Solicitacoes`: aprova/rejeita solicitacoes de cadastro de moradores.
- `Cobrancas`: cria cobrancas em lote, gera QR/Pix, gera PDF de boleto, envia notificacao por aviso, marca pagamento, exclui cobranca e abre WhatsApp.
- `Avisos`: cria/desativa comunicados.
- `Documentos`: upload/remocao de documentos no bucket privado.
- `Contador`: relatorios financeiros/operacionais com acesso restrito.

Morador (`src/components/morador/`):

- `MoradorLayout`: menu da area do morador.
- `Dashboard`: resumo pessoal de cobrancas, avisos e status.
- `Cobrancas`: lista cobrancas, mostra Pix/QR/boleto, permite copiar Pix e solicitar confirmacao de pagamento.
- `AvisosDocumentos`: leitura de avisos e documentos permitidos.
- `Ocorrencias`: abre e acompanha ocorrencias.
- `Perfil`: exibe dados e permite solicitar alteracao cadastral.

Shared:

- `ProtectedRoute`: controle de rota por sessao/papel.
- `Sidebar`: navegacao responsiva.
- `Toast`: notificacoes.
- `ChargeSummaryBars`, `ChargesStatusChart`, `PlatformStatusBanner`: componentes de status/resumo.

## 11. APIs Serverless

Arquivo comum:

- `api/_lib/supabaseAdmin.js`
  - cria clientes Supabase backend com anon key e service role.
  - valida variaveis de ambiente.
  - helpers `json`, `parseJsonBody`.
  - guards `requireAdmin`, `requireCondominiumAdmin`, `requirePlatformAdmin`, `requireAuthenticatedProfile`.
  - bloqueia acesso de tenant quando condominio nao esta liberado.

Auth:

- `POST /api/auth/login-cpf`
  - login por CPF.

- `POST /api/auth/login-cnpj`
  - login por CNPJ do condominio ou documento de platform admin.

Platform:

- `GET /api/platform/condominiums/list`
  - requer `platform_admin`.
  - lista condominios e metricas globais.
  - junta dados de perfis para contar usuarios e identificar sindico.

- `POST /api/platform/condominiums/register`
  - publico, mas requer service role configurada.
  - cria condominio `pending`.
  - cria usuario Auth do sindico.
  - cria profile `ADMIN_CONDOMINIUM`.
  - faz rollback se falhar.

- `POST /api/platform/condominiums/update`
  - requer `platform_admin`.
  - acoes: `approve`, `reject`, `block`, `unblock`, `save`.
  - atualiza metadata de plano/trial.

- `POST /api/platform/condominiums/update-syndic-password`
  - requer `platform_admin`.
  - troca senha do sindico.

Admin:

- `POST /api/admin/residents/create`
  - requer `admin` de condominio.
  - cria usuario Auth e profile de morador ou contador.
  - usa e-mail informado ou e-mail interno `morador-{cpf}-{condominiumId}@login.webcond.local`.

- `POST /api/admin/residents/update`
  - requer admin de condominio.
  - atualiza dados do perfil.

- `POST /api/admin/residents/update-password`
  - requer admin de condominio.
  - altera senha do morador/contador.

- `POST /api/admin/residents/delete`
  - requer admin de condominio.
  - remove usuario e dados vinculados conforme implementacao do endpoint.

- `POST /api/admin/billing/render-pdf`
  - requer admin de condominio.
  - gera PDF A4 via Puppeteer a partir do template HTML.

Tenant:

- `GET /api/tenant/charge-summary`
  - requer perfil autenticado.
  - calcula resumo de apartamentos por status de cobranca.

Health:

- `GET /api/health`
  - verifica variaveis de backend, conexao com Supabase e disponibilidade de service role.

## 12. Fluxos Principais

Cadastro de condominio:

1. Sindico acessa landing.
2. Preenche dados do condominio e do sindico.
3. Frontend chama `/api/platform/condominiums/register`.
4. API cria `condominiums.status = pending`.
5. API cria usuario Auth e profile do sindico.
6. Platform admin entra em `/platform`.
7. Platform admin aprova o condominio.
8. Condominio aprovado recebe metadata de trial.
9. Sindico passa a acessar `/admin`.

Login:

1. Usuario informa CPF/CNPJ e senha.
2. `signInWithDocument` detecta tipo do documento.
3. API autentica por e-mail interno no Supabase Auth.
4. `useAuth` busca profile.
5. Se necessario, valida condominio e plano.
6. App redireciona conforme papel.

Criacao de morador:

1. Admin acessa `/admin > Moradores`.
2. Frontend chama `createResident`.
3. API cria usuario Auth com senha.
4. API grava `profiles` com `role = morador` ou `contador`.
5. Morador entra com CPF + senha.

Cobrancas:

1. Admin seleciona moradores e configura tipo, valor, competencia, vencimento e itens.
2. Pode usar codigo Pix manual, imagem de QR Code ou chave Pix do condominio.
3. Sistema gera QR Code quando necessario.
4. API gera boleto PDF via Puppeteer.
5. PDF e anexos vao para o bucket privado `cobrancas`.
6. Linhas sao inseridas em `cobrancas` com `payment_status = PENDING`.
7. Um aviso e criado para notificar moradores.
8. Morador visualiza cobranca, Pix e boleto.
9. Morador pode informar pagamento, criando ocorrencia especial.
10. Admin confirma manualmente, marcando `payment_status = PAID`, `pago = true`, `paid_at` e `confirmed_by`.

Documentos:

1. Admin envia arquivo em `/admin > Documentos`.
2. Arquivo vai para bucket `documentos`.
3. Registro em `documentos` define categoria, descricao e visibilidade.
4. Morador ve apenas documentos permitidos pela RLS.

Solicitacoes e ocorrencias:

- `solicitacoes_cadastro` e usado para cadastro de moradores.
- `ocorrencias_predio` e usado para ocorrencias reais e tambem solicitacoes internas do morador.
- `src/lib/residentRequests.js` identifica:
  - `PAGAMENTO_CONFIRMADO|{chargeId}`.
  - `ALTERACAO_CADASTRAL|{profileId}`.
  - outros titulos como ocorrencia comum.

## 13. Configuracao de Ambiente

Variaveis esperadas em `.env` / Vercel:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
```

Notas:

- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ir para o frontend.
- A service role e obrigatoria para login por documento, criacao/edicao de usuarios Auth, cadastro de condominio e endpoints administrativos sensiveis.
- `src/lib/supabase.js` usa variaveis `VITE_*` ou `NEXT_PUBLIC_*`.
- `api/_lib/supabaseAdmin.js` usa variaveis de backend.

## 14. Setup Supabase

Fluxo documentado em `DEPLOY.md`:

1. Criar projeto Supabase.
2. Copiar Project URL, anon/public key e service role key.
3. Preencher `.env`.
4. Executar `schema.sql` em projeto novo ou `schema_updates.sql` em projeto existente.
5. Confirmar tabelas, indices, RLS e buckets privados.
6. Criar `PLATFORM_ADMIN`.
7. Cadastrar condominio pela landing.
8. Aprovar condominio no painel global.
9. Criar moradores e testar login.
10. Habilitar Realtime para `public.solicitacoes_cadastro` se quiser contador em tempo real.

## 15. Scripts Locais

`scripts/create-platform-admin.mjs`:

- Cria ou atualiza usuario Auth de platform admin.
- Usa `--document` com CNPJ de 14 digitos.
- Usa `--password`, `--name` e opcionalmente `--email`.
- Grava profile `PLATFORM_ADMIN` sem condominio.

Exemplo conceitual:

```bash
npm run supabase:create-platform-admin -- --document=00000000000000 --password=senha123 --name="Admin Plataforma"
```

`scripts/supabase-audit-and-sync.mjs`:

- Le `profiles`, `solicitacoes_cadastro` e usuarios Auth.
- Normaliza CPF/WhatsApp.
- Limpa `telefone` legado.
- Sincroniza metadados do Auth.
- Gera `SUPABASE_AUDIT.md`.

`scripts/clear-registrations.mjs`:

- Remove registros de teste/cadastro conforme script.
- Usar com cuidado porque altera dados no Supabase.

## 16. Arquivos de Configuracao

- `vite.config.js`: configuracao Vite.
- `eslint.config.js`: lint.
- `vercel.json`: rewrites de SPA.
- `.env.example`: exemplo de variaveis Supabase.
- `.gitignore`: controle de arquivos ignorados.
- `public/manifest.json` e `public/sw.js`: suporte basico PWA/service worker.

## 17. Pontos de Atencao Para Futuras IAs

- Nao quebrar o par `condominium_id` / `condominio_id`; o projeto ainda usa ambos por compatibilidade.
- Nao expor `SUPABASE_SERVICE_ROLE_KEY` no client.
- Manter operacoes sensiveis de Auth no backend em `api/`.
- Ao criar queries diretas no client, aplicar filtro de tenant e confiar tambem nas policies RLS.
- Platform admin nao deve acessar dados financeiros detalhados dos condominios.
- A role `contador` existe e tem acesso limitado a relatorios; nao tratar apenas os tres papeis originais.
- Status de cobranca deve usar `payment_status`, mas alguns trechos ainda consideram o legado booleano `pago`.
- O status real de um condominio pode ser diferente de `condominiums.status` quando o trial expira; usar `getCondominiumAccessState`.
- `Solicitacoes.jsx` chama `createResident` sem enviar senha, mas `api/admin/residents/create.js` exige senha de pelo menos 6 caracteres. Isto parece um bug/pendencia de integracao a revisar.
- `architecture.md` e parte da documentacao original e pode conter texto com encoding corrompido; preferir este `resumo.md`, `DEPLOY.md` e o codigo real como fontes atuais.
- Nao assumir que o schema esta aplicado no Supabase remoto; validar ambiente e rodar `npm run supabase:audit` quando houver credenciais.

## 18. Como Uma IA Deve Comecar a Trabalhar Neste Projeto

1. Ler este `resumo.md`.
2. Ler `package.json` para comandos e dependencias.
3. Ler `src/App.jsx` para rotas.
4. Ler `src/hooks/useAuth.jsx`, `src/lib/auth.js` e `api/_lib/supabaseAdmin.js` antes de mexer em auth/permissoes.
5. Ler `src/lib/tenant.js` antes de criar ou alterar queries.
6. Ler `schema.sql` ou `schema_updates.sql` antes de alterar modelo de dados.
7. Para cobrancas, ler `src/components/admin/Cobrancas.jsx`, `src/components/morador/Cobrancas.jsx`, `src/lib/chargeStatus.js` e `api/admin/billing/render-pdf.js`.
8. Para plataforma, ler `src/components/platform/*` e `api/platform/condominiums/*`.
9. Rodar `npm run lint` e `npm run build` apos alteracoes relevantes.

## 19. Resumo Curto Para Contexto Rapido

WebCond e um SaaS React/Vite + Supabase + Vercel para gestao de multiplos condominios. A entidade central e `condominiums`; dados de moradores, cobrancas, avisos, documentos, solicitacoes e ocorrencias sao isolados por `condominium_id` e `condominio_id`. O login aceita CPF/CNPJ, mas usa Supabase Auth com e-mail por baixo. Existem paineis separados para plataforma, sindico/admin/contador e morador. O financeiro atual e manual: admin cria cobrancas com Pix/QR/boleto, morador visualiza e informa pagamento, admin confirma manualmente. O Supabase precisa de schema, RLS e buckets privados configurados para o app funcionar corretamente.
