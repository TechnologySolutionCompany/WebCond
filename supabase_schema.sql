-- =============================================
-- WebCond / Eco Living Residência III
-- Schema Supabase — VERSÃO CORRIGIDA
-- Execute TUDO no SQL Editor do Supabase
-- =============================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'morador' CHECK (role IN ('admin', 'morador')),
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  telefone TEXT DEFAULT '',
  apartamento TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  data_entrada DATE,
  foto_url TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  observacao TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SOLICITAÇÕES DE CADASTRO
CREATE TABLE IF NOT EXISTS solicitacoes_cadastro (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  apartamento TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  mensagem TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  aprovado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COBRANÇAS
CREATE TABLE IF NOT EXISTS cobrancas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  morador_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'condominio' CHECK (tipo IN ('condominio', 'agua', 'energia', 'multa', 'outro')),
  mes_referencia TEXT NOT NULL DEFAULT '',
  vencimento DATE NOT NULL,
  pago BOOLEAN DEFAULT false,
  data_pagamento DATE,
  observacao TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AVISOS
CREATE TABLE IF NOT EXISTS avisos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL DEFAULT '',
  conteudo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'informativo' CHECK (tipo IN ('aviso', 'urgente', 'informativo', 'manutencao')),
  destinatario TEXT NOT NULL DEFAULT 'todos' CHECK (destinatario IN ('todos', 'apartamento', 'especifico')),
  apartamento_destino TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DOCUMENTOS
CREATE TABLE IF NOT EXISTS documentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL DEFAULT '',
  descricao TEXT DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'outro' CHECK (categoria IN ('ata', 'regimento', 'contrato', 'financeiro', 'outro')),
  arquivo_url TEXT NOT NULL DEFAULT '',
  publico BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_cadastro ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_morador_own" ON profiles;
DROP POLICY IF EXISTS "profiles_morador_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "solicitacoes_public_insert" ON solicitacoes_cadastro;
DROP POLICY IF EXISTS "solicitacoes_admin_all" ON solicitacoes_cadastro;
DROP POLICY IF EXISTS "cobrancas_admin_all" ON cobrancas;
DROP POLICY IF EXISTS "cobrancas_morador_own" ON cobrancas;
DROP POLICY IF EXISTS "avisos_admin_all" ON avisos;
DROP POLICY IF EXISTS "avisos_morador_read" ON avisos;
DROP POLICY IF EXISTS "documentos_admin_all" ON documentos;
DROP POLICY IF EXISTS "documentos_morador_read" ON documentos;

CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "profiles_morador_own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_morador_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "solicitacoes_public_insert" ON solicitacoes_cadastro FOR INSERT WITH CHECK (true);
CREATE POLICY "solicitacoes_public_select" ON solicitacoes_cadastro FOR SELECT USING (true);
CREATE POLICY "solicitacoes_admin_all" ON solicitacoes_cadastro FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

CREATE POLICY "cobrancas_admin_all" ON cobrancas FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "cobrancas_morador_own" ON cobrancas FOR SELECT USING (morador_id = auth.uid());

CREATE POLICY "avisos_admin_all" ON avisos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "avisos_morador_read" ON avisos FOR SELECT USING (ativo = true);

CREATE POLICY "documentos_admin_all" ON documentos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "documentos_morador_read" ON documentos FOR SELECT USING (publico = true);

-- =============================================
-- TRIGGER: criar profile automaticamente
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'morador'),
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- STORAGE bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentos_upload" ON storage.objects;
DROP POLICY IF EXISTS "documentos_public_read" ON storage.objects;
CREATE POLICY "documentos_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documentos' AND auth.role() = 'authenticated');
CREATE POLICY "documentos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'documentos');

-- =============================================
-- APÓS criar o admin no Auth, execute:
-- UPDATE profiles SET role='admin', nome='Estevão Miguel'
-- WHERE email='estevao.miguel.dev@gmail.com';
-- =============================================
