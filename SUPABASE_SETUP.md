# Supabase Setup

Este projeto depende de configuracao manual no Supabase para funcionar por completo. Siga os passos abaixo.

## 1. Escolha o SQL certo

- Projeto Supabase novo: execute [`schema.sql`](/d:/webcond_final/schema.sql)
- Projeto Supabase que ja tem tabelas/dados: execute [`schema_updates.sql`](/d:/webcond_final/schema_updates.sql)

Os dois arquivos fazem o seguinte:

- corrigem o trigger de criacao de perfil no `auth.users`
- alinham as politicas RLS com o app atual
- garantem unicidade do `cpf` em `public.profiles`
- criam a tabela `ocorrencias_predio`
- criam a tabela `app_health` usada pelo endpoint `/api/health`
- tornam o bucket `documentos` privado e seguro
- criam e protegem o bucket `cobrancas` (anexos de pagamento e boletos)
- adicionam `arquivo_path` para links assinados de documentos
- adicionam campos de pagamento/anexo/boleto na tabela `cobrancas`
- mantem o campo `telefone` apenas por compatibilidade, mas o app usa somente `whatsapp`

## 1.1 Login do morador

- Morador: `CPF + senha`
- Administrador: `e-mail + senha`

O e-mail do morador continua existindo no Supabase Auth para identificacao interna, recuperacao e integracoes, mas a tela do morador nao usa mais o e-mail como credencial de acesso.

## 2. Crie o primeiro administrador

1. No painel do Supabase, abra `Authentication > Users`
2. Crie o usuario administrador com email e senha
3. No `SQL Editor`, execute:

```sql
update public.profiles
set role = 'admin',
    nome = 'Seu Nome'
where email = 'seu-email@dominio.com';
```

Sem isso, o login entra, mas a area administrativa nao libera as operacoes protegidas.

## 3. Configure as variaveis de ambiente

No frontend/local/Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No backend/Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Compatibilidade adicional:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

Observacoes:

- a `SUPABASE_SERVICE_ROLE_KEY` deve existir apenas no backend
- sem a service role real, o sistema ainda funciona parcialmente, mas troca de senha, troca de email de login e criacao administrativa de usuarios ficam limitadas

## 4. Ative o Realtime da tabela de solicitacoes

O painel admin escuta mudancas em `solicitacoes_cadastro`.

No Supabase, habilite o Realtime/publication para:

- `public.solicitacoes_cadastro`

Se isso nao estiver ativo, novas solicitacoes entram no banco, mas o contador em tempo real da area admin nao atualiza sozinho.

## 5. Confira o bucket de documentos

Depois de executar o SQL:

- o bucket `documentos` deve existir
- ele deve estar `private`, nao `public`

O app agora usa URL assinada para download, inclusive para documentos restritos.

## 5.1 Confira o bucket de cobrancas

Depois de executar o SQL:

- o bucket `cobrancas` deve existir
- ele deve estar `private`
- o admin deve conseguir upload de anexo/boleto
- o morador deve abrir apenas os arquivos das proprias cobrancas

O app usa URL assinada para o morador abrir:

- boleto gerado
- anexo de pagamento (qrcode/imagem/pdf/etc)

## 6. Verificacao rapida

Depois de terminar a configuracao, valide:

1. Abrir a landing e enviar uma solicitacao de cadastro
2. Entrar com o admin e aprovar a solicitacao
3. Criar um morador manualmente na tela de moradores com `nome`, `e-mail`, `cpf`, `whatsapp`, `apartamento` e `data de entrada`
4. Publicar um aviso
5. Enviar um documento publico
6. Entrar com um morador usando `CPF + senha` e conferir cobrancas, avisos, documentos e ocorrencias
7. No admin, criar uma cobranca com anexo/link e confirmar se o morador recebe aviso e consegue abrir boleto/anexo
8. Conferir o banner de status da plataforma

## 6.1 Auditoria automatica

Para auditar e sincronizar os dados remotos do Supabase com o padrao novo, rode:

```bash
npm run supabase:audit
```

Esse script:

- normaliza CPF e WhatsApp
- limpa `telefone` onde ainda existir
- tenta completar solicitacoes antigas com dados do perfil quando houver correspondencia segura por e-mail
- sincroniza `user_metadata` no Auth
- gera o arquivo [`SUPABASE_AUDIT.md`](/d:/webcond_final/SUPABASE_AUDIT.md) com o resultado e as pendencias manuais

## 7. Se algo ainda falhar

Cheque primeiro:

- se o SQL certo foi executado sem erro
- se o admin foi promovido para `role = 'admin'`
- se a `SUPABASE_SERVICE_ROLE_KEY` real foi configurada
- se o Realtime da tabela `solicitacoes_cadastro` foi habilitado
- se o deploy recebeu as mesmas env vars do ambiente local
