# Supabase Setup - WebCond SaaS

Este projeto esta pronto no codigo, mas depende da preparacao do Supabase antes de rodar os fluxos reais de login, cadastro, cobrancas e arquivos.

## 1. O que ja existe no projeto

- Arquitetura multi-condominio com tabela `condominiums`
- Isolamento por `condominium_id` nas tabelas principais
- Login unico por CPF/CNPJ + senha
- Roles: `PLATFORM_ADMIN`, `ADMIN_CONDOMINIUM`, `RESIDENT`
- Cadastro de condominio pela landing com status `pending`
- Painel global em `/platform` para aprovar, rejeitar, bloquear, desbloquear e editar condominios
- Painel do sindico em `/admin`
- Area do morador em `/morador`
- Cobrancas manuais com Pix, QR Code/copia e cola, boleto/anexo e confirmacao manual
- Buckets privados `documentos` e `cobrancas`

## 2. Crie e configure o projeto Supabase

1. Crie um projeto no Supabase.
2. Abra `Project Settings > API`.
3. Copie:
   - Project URL
   - anon/public key
   - service_role key
4. Preencha o `.env` local:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=SUA_ANON_KEY
```

A `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente em ambiente de backend/local seguro. Ela e obrigatoria para login por CPF/CNPJ, cadastro de condominio e criacao/alteracao de usuarios pelo painel admin.

## 3. Execute o SQL

Projeto Supabase novo:

```sql
-- Cole e execute todo o conteudo de schema.sql no SQL Editor
```

Projeto Supabase que ja tem tabelas/dados:

```sql
-- Cole e execute todo o conteudo de schema_updates.sql no SQL Editor
```

Depois disso, confira se existem:

- tabela `condominiums`
- tabela `profiles`
- tabela `solicitacoes_cadastro`
- tabela `cobrancas`
- tabela `avisos`
- tabela `documentos`
- tabela `ocorrencias_predio`
- buckets privados `documentos` e `cobrancas`

## 4. Crie sua conta de PLATFORM_ADMIN

1. No Supabase, abra `Authentication > Users`.
2. Crie seu usuario administrador global com e-mail e senha.
3. No `SQL Editor`, execute, trocando os dados:

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

Esse usuario entra pelo CPF + senha e deve cair em `/platform`.

## 5. Cadastre o condominio do sindico

1. Rode o projeto.
2. Na landing, abra `Cadastrar condominio`.
3. Preencha dados do condominio e do sindico. No documento do condominio, use CPF quando o condominio ainda nao tiver CNPJ e CNPJ quando ja tiver.
4. O sistema cria:
   - `condominiums.status = 'pending'`
   - usuario Auth do sindico
   - perfil do sindico com role `ADMIN_CONDOMINIUM`
5. Entre com o `PLATFORM_ADMIN`.
6. Abra `/platform > Condominios`.
7. Aprove o condominio.

Antes da aprovacao, o sindico autentica, mas o app bloqueia o acesso porque o condominio esta `pending`. Depois de aprovado, o sindico pode entrar pelo proprio CPF ou pelo CNPJ do condominio quando esse CNPJ estiver cadastrado.

## 6. Crie os 3 moradores de teste

Depois que o condominio estiver `active`:

1. Entre com o CPF ou CNPJ + senha do sindico.
2. Abra `/admin > Moradores`.
3. Cadastre 3 moradores com:
   - nome
   - e-mail
   - CPF
   - WhatsApp
   - apartamento
   - data de entrada
4. O sistema gera uma senha temporaria para cada morador.
5. Cada morador entra usando CPF + senha temporaria.

## 7. Ative Realtime

No Supabase, habilite Realtime/publication para:

- `public.solicitacoes_cadastro`

Sem isso, as solicitacoes ainda entram no banco, mas o contador em tempo real do admin pode nao atualizar automaticamente.

## 8. Verificacao rapida

1. `PLATFORM_ADMIN` entra por CPF e acessa `/platform`.
2. Cadastro de condominio novo fica `pending`.
3. `PLATFORM_ADMIN` aprova o condominio.
4. Sindico entra por CPF ou CNPJ e acessa `/admin`.
5. Sindico cria 3 moradores.
6. Moradores entram por CPF e acessam `/morador`.
7. Sindico cria uma cobranca com Pix/anexo/boleto.
8. Morador visualiza cobranca, QR Code/codigo Pix e documentos permitidos.
9. Sindico marca pagamento como recebido manualmente.
10. Bloqueie o condominio no `/platform` e confirme que sindico/moradores nao conseguem acessar.

## 9. Auditoria automatica

Se estiver migrando dados ou quiser conferir inconsistencias:

```bash
npm run supabase:audit
```

O script gera/atualiza `SUPABASE_AUDIT.md` com pendencias encontradas.

## 10. Comandos locais

No PowerShell desta maquina, se `npm` estiver bloqueado pela execution policy, use:

```bash
npm.cmd run dev
npm.cmd run build
npm.cmd run lint
```

O `npm run dev` normal pode falhar no PowerShell por causa do arquivo `npm.ps1`; isso e configuracao do Windows, nao erro do projeto.
