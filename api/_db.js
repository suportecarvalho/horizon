/**
 * Módulo de Banco de Dados - Feed Horizon
 * Suporta Supabase (PostgreSQL na nuvem) com fallback automático para JSON local.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Carregar variáveis de ambiente de .env, .env.local ou .env.example caso existam
function loadEnv() {
  const envFiles = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env.example'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env.example')
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, 'utf-8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] && !val.includes('seu-projeto') && !val.includes('sua-chave')) {
              process.env[key] = val;
            }
          }
        });
      } catch (e) {}
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwgswqwqwrnpmcirajre.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Z3N3cXdxd3JucG1jaXJhanJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mzc0NzgxMiwiZXhwIjoyMTA5MzIzODEyfQ.GPb3PY0kWwQZwfSVo4wp6QC_3ee-cW0_OYiTkZVIW4U';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    console.log('[Database] Supabase conectado com sucesso em:', SUPABASE_URL);
  } catch (e) {
    console.warn('[Database] Erro ao inicializar cliente Supabase:', e.message);
  }
} else {
  console.log('[Database] Nenhuma chave Supabase detectada. Utilizando armazenamento local persistente (data/feed.json).');
}

// Arquivos locais para fallback
const DATA_FILE = path.join(process.cwd(), 'data', 'feed.json');
const TMP_FILE = '/tmp/feed.json';
let memoryPosts = null;

function loadLocalPosts() {
  if (memoryPosts) return memoryPosts;
  try {
    if (fs.existsSync(TMP_FILE)) {
      return (memoryPosts = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8')));
    }
  } catch (e) {}
  try {
    if (fs.existsSync(DATA_FILE)) {
      return (memoryPosts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')));
    }
  } catch (e) {}
  memoryPosts = [];
  return memoryPosts;
}

function saveLocalPosts(posts) {
  memoryPosts = posts;
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8'); } catch (e) {}
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(posts, null, 2), 'utf-8'); } catch (e) {}
}

/**
 * Retorna todos os posts formatados para o feed
 */
async function getPosts() {
  if (supabase) {
    try {
      // 1. Busca todos os posts ordenados por data
      const { data: posts, error: postErr } = await supabase
        .from('feed_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (postErr) throw postErr;

      if (!posts || posts.length === 0) {
        return [];
      }

      // 2. Busca likes e comentários para compor a lista
      const postIds = posts.map(p => p.id);

      const [likesRes, commentsRes] = await Promise.all([
        supabase.from('feed_likes').select('post_id, steamid').in('post_id', postIds),
        supabase.from('feed_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true })
      ]);

      const likesByPost = {};
      (likesRes.data || []).forEach(l => {
        if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
        likesByPost[l.post_id].push(l.steamid);
      });

      const commentsByPost = {};
      (commentsRes.data || []).forEach(c => {
        if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
        commentsByPost[c.post_id].push({
          id: c.id,
          author: {
            steamId: c.author_steamid,
            name: c.author_name,
            avatar: c.author_avatar
          },
          text: c.text,
          createdAt: c.created_at
        });
      });

      return posts.map(p => ({
        id: p.id,
        author: {
          steamId: p.author_steamid,
          name: p.author_name,
          avatar: p.author_avatar
        },
        imageUrl: p.image_url,
        caption: p.caption,
        tag: p.tag,
        createdAt: p.created_at,
        likes: likesByPost[p.id] || [],
        comments: commentsByPost[p.id] || []
      }));
    } catch (e) {
      console.error('[Database Supabase] Erro ao buscar posts, caindo no fallback local:', e.message);
    }
  }

  // Fallback Local
  return loadLocalPosts();
}

/**
 * Cria uma nova publicação
 */
async function createPost({ id, author, imageUrl, caption, tag, createdAt }) {
  const newPostId = id || 'post-' + Date.now();
  const createdDate = createdAt || new Date().toISOString();

  if (supabase) {
    try {
      const { error } = await supabase.from('feed_posts').insert([{
        id: newPostId,
        author_steamid: author.steamId || author.steamid,
        author_name: author.name,
        author_avatar: (author.avatar || '').replace(/\\\//g, '/'),
        image_url: imageUrl,
        caption: caption.slice(0, 500),
        tag: (tag || '📸 Screenshot').slice(0, 30),
        created_at: createdDate
      }]);

      if (error) throw error;

      return {
        id: newPostId,
        author,
        imageUrl,
        caption,
        tag: tag || '📸 Screenshot',
        createdAt: createdDate,
        likes: [],
        comments: []
      };
    } catch (e) {
      console.error('[Database Supabase] Erro ao criar post, salvando no fallback local:', e.message);
    }
  }

  // Fallback Local
  const posts = loadLocalPosts();
  const newPost = {
    id: newPostId,
    author,
    imageUrl,
    caption: caption.slice(0, 500),
    tag: tag || '📸 Screenshot',
    createdAt: createdDate,
    likes: [],
    comments: []
  };
  posts.unshift(newPost);
  saveLocalPosts(posts);
  return newPost;
}

/**
 * Alterna curtida em uma publicação (Like/Unlike)
 */
async function toggleLike({ postId, steamId }) {
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('feed_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('steamid', steamId)
        .maybeSingle();

      let hasLiked = false;
      if (existing) {
        await supabase.from('feed_likes').delete().eq('id', existing.id);
        hasLiked = false;
      } else {
        await supabase.from('feed_likes').insert([{ post_id: postId, steamid: steamId }]);
        hasLiked = true;
      }

      const { count } = await supabase
        .from('feed_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      return { success: true, hasLiked, likesCount: count || 0 };
    } catch (e) {
      console.error('[Database Supabase] Erro ao alternar like, usando fallback local:', e.message);
    }
  }

  // Fallback Local
  const posts = loadLocalPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error('Publicação não encontrada');
  if (!Array.isArray(post.likes)) post.likes = [];

  const idx = post.likes.indexOf(steamId);
  let hasLiked = false;
  if (idx >= 0) {
    post.likes.splice(idx, 1);
    hasLiked = false;
  } else {
    post.likes.push(steamId);
    hasLiked = true;
  }
  saveLocalPosts(posts);
  return { success: true, hasLiked, likesCount: post.likes.length };
}

/**
 * Adiciona um comentário
 */
async function addComment({ postId, author, text, createdAt }) {
  const commentId = 'c-' + Date.now();
  const dateIso = createdAt || new Date().toISOString();

  if (supabase) {
    try {
      const { error } = await supabase.from('feed_comments').insert([{
        id: commentId,
        post_id: postId,
        author_steamid: author.steamId || author.steamid,
        author_name: author.name,
        author_avatar: (author.avatar || '').replace(/\\\//g, '/'),
        text: text.slice(0, 300),
        created_at: dateIso
      }]);

      if (error) throw error;

      const { count } = await supabase
        .from('feed_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const commentObj = {
        id: commentId,
        author,
        text: text.slice(0, 300),
        createdAt: dateIso
      };

      return { success: true, comment: commentObj, commentsCount: count || 0 };
    } catch (e) {
      console.error('[Database Supabase] Erro ao comentar no Supabase, usando fallback local:', e.message);
    }
  }

  // Fallback Local
  const posts = loadLocalPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error('Publicação não encontrada');
  if (!Array.isArray(post.comments)) post.comments = [];

  const newComment = {
    id: commentId,
    author,
    text: text.slice(0, 300),
    createdAt: dateIso
  };
  post.comments.push(newComment);
  saveLocalPosts(posts);
  return { success: true, comment: newComment, commentsCount: post.comments.length };
}

/**
 * Faz upload de imagem para o Supabase Storage (se configurado)
 */
async function uploadImage({ buffer, mimeType, filename }) {
  if (supabase) {
    try {
      const ext = path.extname(filename) || '.jpg';
      const storagePath = `uploads/${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;

      const { error } = await supabase.storage
        .from('feed-photos')
        .upload(storagePath, buffer, {
          contentType: mimeType || 'image/jpeg',
          upsert: true
        });

      if (error) throw error;

      const { data } = supabase.storage
        .from('feed-photos')
        .getPublicUrl(storagePath);

      return { success: true, url: data.publicUrl };
    } catch (e) {
      console.error('[Storage Supabase] Erro no upload:', e.message);
    }
  }

  return { success: false, error: 'Storage Supabase não configurado' };
}

/**
 * Edita uma publicação (legenda e tag)
 */
async function editPost({ postId, caption, tag }) {
  if (supabase) {
    try {
      const updateData = {};
      if (caption !== undefined) updateData.caption = caption.slice(0, 500);
      if (tag !== undefined) updateData.tag = tag.slice(0, 30);

      const { data, error } = await supabase
        .from('feed_posts')
        .update(updateData)
        .eq('id', postId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, post: data };
    } catch (e) {
      console.error('[Database Supabase] Erro ao editar post, usando fallback local:', e.message);
    }
  }

  // Fallback Local
  const posts = loadLocalPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error('Publicação não encontrada');
  if (caption !== undefined) post.caption = caption.slice(0, 500);
  if (tag !== undefined) post.tag = tag.slice(0, 30);
  saveLocalPosts(posts);
  return { success: true, post };
}

/**
 * Exclui uma publicação e todas as suas interações
 */
async function deletePost(postId) {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('feed_posts')
        .delete()
        .eq('id', postId);

      if (error) {
        console.error('[Database Supabase] Erro ao excluir post do Supabase:', error);
        throw error;
      }
    } catch (e) {
      console.error('[Database Supabase] Erro ao excluir post, usando fallback local:', e.message);
    }
  }

  // Sincroniza sempre o cache local para nunca reaparecer
  let posts = loadLocalPosts();
  posts = posts.filter(p => p.id !== postId);
  saveLocalPosts(posts);
  return { success: true };
}

/**
 * Exclui um comentário
 */
async function deleteComment({ postId, commentId }) {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('feed_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('[Database Supabase] Erro ao excluir comentário do Supabase:', error);
        throw error;
      }
    } catch (e) {
      console.error('[Database Supabase] Erro ao excluir comentário:', e.message);
    }
  }

  // Sincroniza sempre o cache local
  const posts = loadLocalPosts();
  const post = posts.find(p => p.id === postId);
  if (post && Array.isArray(post.comments)) {
    post.comments = post.comments.filter(c => c.id !== commentId);
    saveLocalPosts(posts);
  }
  return { success: true };
}

module.exports = {
  isSupabaseConfigured: () => !!supabase,
  getPosts,
  createPost,
  editPost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment,
  uploadImage
};

