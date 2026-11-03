const fs = require('fs');
const path = require('path');
const { getSessionUser } = require('./_auth');

const DATA_FILE = path.join(process.cwd(), 'data', 'feed.json');
const TMP_FILE = '/tmp/feed.json';

// Cache em memória durante execução do ambiente serverless
let memoryPosts = null;

function loadPosts() {
  if (memoryPosts) return memoryPosts;

  try {
    if (fs.existsSync(TMP_FILE)) {
      const content = fs.readFileSync(TMP_FILE, 'utf-8');
      memoryPosts = JSON.parse(content);
      return memoryPosts;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      memoryPosts = JSON.parse(content);
      return memoryPosts;
    }
  } catch (e) {}

  memoryPosts = [];
  return memoryPosts;
}

function savePosts(posts) {
  memoryPosts = posts;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (e) {}
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (e) {}
}

module.exports = async (req, res) => {
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(data));
      return this;
    };
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const posts = loadPosts();

  // GET: Retorna lista de posts do feed
  if (req.method === 'GET') {
    return res.status(200).json(posts);
  }

  // POST: Ações interativas (criar post, curtir, comentar)
  if (req.method === 'POST') {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Você precisa estar logado com a Steam para interagir no Feed!'
      });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'JSON inválido' });
      }
    }
    body = body || {};

    const action = body.action || req.query.action || 'create';

    // 1. CURTIR / DESCURTIR
    if (action === 'like') {
      const postId = body.postId || req.query.postId;
      const post = posts.find(p => p.id === postId);
      if (!post) {
        return res.status(404).json({ error: 'Publicação não encontrada' });
      }

      if (!Array.isArray(post.likes)) post.likes = [];
      const userSteamId = user.steamId || user.steamid;
      const idx = post.likes.indexOf(userSteamId);

      let hasLiked = false;
      if (idx >= 0) {
        post.likes.splice(idx, 1);
        hasLiked = false;
      } else {
        post.likes.push(userSteamId);
        hasLiked = true;
      }

      savePosts(posts);
      return res.status(200).json({
        success: true,
        likesCount: post.likes.length,
        hasLiked
      });
    }

    // 2. COMENTAR
    if (action === 'comment') {
      const postId = body.postId || req.query.postId;
      const text = (body.text || '').trim();

      if (!text) {
        return res.status(400).json({ error: 'O comentário não pode estar vazio' });
      }

      const post = posts.find(p => p.id === postId);
      if (!post) {
        return res.status(404).json({ error: 'Publicação não encontrada' });
      }

      if (!Array.isArray(post.comments)) post.comments = [];

      const newComment = {
        id: 'c-' + Date.now(),
        author: {
          steamId: user.steamId || user.steamid,
          name: user.name,
          avatar: (user.avatar || '').replace(/\\\//g, '/')
        },
        text: text.slice(0, 300),
        createdAt: new Date().toISOString()
      };

      post.comments.push(newComment);
      savePosts(posts);

      return res.status(200).json({
        success: true,
        comment: newComment,
        commentsCount: post.comments.length
      });
    }

    // 3. CRIAR NOVA PUBLICAÇÃO
    if (action === 'create') {
      const imageUrl = (body.imageUrl || '').trim();
      const caption = (body.caption || '').trim();
      const tag = (body.tag || '📸 Screenshot').trim();

      if (!imageUrl) {
        return res.status(400).json({ error: 'Insira o link de uma imagem ou print para publicar!' });
      }

      if (!caption) {
        return res.status(400).json({ error: 'Escreva uma legenda para sua foto!' });
      }

      const newPost = {
        id: 'post-' + Date.now(),
        author: {
          steamId: user.steamId || user.steamid,
          name: user.name,
          avatar: (user.avatar || '').replace(/\\\//g, '/')
        },
        imageUrl,
        caption: caption.slice(0, 500),
        tag: tag.slice(0, 30),
        createdAt: new Date().toISOString(),
        likes: [],
        comments: []
      };

      // Adiciona no topo do feed
      posts.unshift(newPost);
      savePosts(posts);

      return res.status(200).json({
        success: true,
        post: newPost
      });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  }

  return res.status(455).json({ error: 'Método não permitido' });
};
