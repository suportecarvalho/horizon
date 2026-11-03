-- ==============================================================
-- SCHEMA DO FEED HORIZON NO SUPABASE (POSTGRESQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ==============================================================

-- 1. Tabela de Postagens (feed_posts)
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id TEXT PRIMARY KEY,
  author_steamid TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL,
  tag TEXT DEFAULT '📸 Screenshot',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Curtidas (feed_likes)
CREATE TABLE IF NOT EXISTS public.feed_likes (
  id BIGSERIAL PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  steamid TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, steamid)
);

-- 3. Tabela de Comentários (feed_comments)
CREATE TABLE IF NOT EXISTS public.feed_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  author_steamid TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca ultrarrápida
CREATE INDEX IF NOT EXISTS idx_feed_posts_created_at ON public.feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_likes_post_id ON public.feed_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post_id ON public.feed_comments(post_id, created_at ASC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (Permite leitura e escrita pelas APIs seguras do site)
DROP POLICY IF EXISTS "Permitir leitura publica de posts" ON public.feed_posts;
CREATE POLICY "Permitir leitura publica de posts" ON public.feed_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir criacao de posts" ON public.feed_posts;
CREATE POLICY "Permitir criacao de posts" ON public.feed_posts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura publica de curtidas" ON public.feed_likes;
CREATE POLICY "Permitir leitura publica de curtidas" ON public.feed_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir gerenciar curtidas" ON public.feed_likes;
CREATE POLICY "Permitir gerenciar curtidas" ON public.feed_likes FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir leitura publica de comentarios" ON public.feed_comments;
CREATE POLICY "Permitir leitura publica de comentarios" ON public.feed_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir criacao de comentarios" ON public.feed_comments;
CREATE POLICY "Permitir criacao de comentarios" ON public.feed_comments FOR INSERT WITH CHECK (true);

-- Criar Bucket de Armazenamento para Uploads de Imagens do Feed (feed-photos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-photos', 'feed-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso público para o bucket de imagens
DROP POLICY IF EXISTS "Acesso publico as fotos do feed" ON storage.objects;
CREATE POLICY "Acesso publico as fotos do feed" ON storage.objects
FOR SELECT USING (bucket_id = 'feed-photos');

DROP POLICY IF EXISTS "Upload de fotos no feed" ON storage.objects;
CREATE POLICY "Upload de fotos no feed" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'feed-photos');

