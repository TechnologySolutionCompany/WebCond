# 🚀 Setup — Criar Admin no Supabase

## Passo 1 — Corrigir o .env
O arquivo .env não pode ter espaços antes das variáveis.
✅ CORRETO:
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=sua-chave

❌ ERRADO (com espaço):
  VITE_SUPABASE_URL=...  ← espaço antes causa bug!

## Passo 2 — Executar o Schema
1. Supabase Dashboard → SQL Editor → New Query
2. Cole TODO o conteúdo do arquivo `supabase_schema.sql`
3. Clique em RUN

## Passo 3 — Criar o usuário Admin
1. Supabase → Authentication → Users → Add User
   - Email: estevao.miguel.dev@gmail.com
   - Password: admin123@
   - ✅ Auto Confirm User: ATIVADO

2. Após criar, vá no SQL Editor e execute:
   UPDATE profiles
   SET role = 'admin', nome = 'Estevão Miguel'
   WHERE email = 'estevao.miguel.dev@gmail.com';

## Passo 4 — Rodar o projeto
  npm install
  npm run dev
  → http://localhost:5173

## Login admin:
  Email: estevao.miguel.dev@gmail.com
  Senha: admin123@
