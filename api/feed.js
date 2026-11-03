const { getSessionUser } = require('./_auth');
const db = require('./_db');

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

  // GET: Retorna posts do feed (via Supabase ou Fallback)
  if (req.method === 'GET') {
    try {
      const posts = await db.getPosts();
      return res.status(200).json(posts);
    } catch (e) {
      console.error('[API Feed] Erro ao listar posts:', e);
      return res.status(500).json({ error: 'Erro ao carregar publicações' });
    }
  }

  // POST: Ações autenticadas com Steam
  if (req.method === 'POST') {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Você precisa estar conectado com a Steam para realizar esta ação!'
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

    const action = body.action || req.query?.action || 'create';

    // 1. UPLOAD DE FOTO (Base64)
    if (action === 'upload') {
      const base64Data = body.image || body.base64;
      const filename = body.filename || `print_${Date.now()}.jpg`;
      const mimeType = body.mimeType || 'image/jpeg';

      if (!base64Data) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada' });
      }

      try {
        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');

        const uploadResult = await db.uploadImage({ buffer, mimeType, filename });
        if (uploadResult.success && uploadResult.url) {
          return res.status(200).json({ success: true, url: uploadResult.url });
        } else {
          return res.status(400).json({
            error: uploadResult.error || 'Armazenamento de fotos ainda não configurado no Supabase. Use o link direto da imagem.'
          });
        }
      } catch (e) {
        console.error('[API Feed] Erro ao processar upload:', e);
        return res.status(500).json({ error: 'Falha no processamento da imagem' });
      }
    }

    // 2. CURTIR / DESCURTIR
    if (action === 'like') {
      const postId = body.postId || req.query?.postId;
      if (!postId) {
        return res.status(400).json({ error: 'postId obrigatório' });
      }

      try {
        const result = await db.toggleLike({
          postId,
          steamId: user.steamId || user.steamid
        });
        return res.status(200).json(result);
      } catch (e) {
        return res.status(404).json({ error: e.message || 'Publicação não encontrada' });
      }
    }

    // 3. COMENTAR
    if (action === 'comment') {
      const postId = body.postId || req.query?.postId;
      const text = (body.text || '').trim();

      if (!text) {
        return res.status(400).json({ error: 'O comentário não pode estar vazio' });
      }

      try {
        const result = await db.addComment({
          postId,
          author: {
            steamId: user.steamId || user.steamid,
            name: user.name,
            avatar: (user.avatar || '').replace(/\\\//g, '/')
          },
          text
        });
        return res.status(200).json(result);
      } catch (e) {
        return res.status(404).json({ error: e.message || 'Publicação não encontrada' });
      }
    }

    // 4. CRIAR PUBLICAÇÃO
    if (action === 'create') {
      const imageUrl = (body.imageUrl || '').trim();
      const caption = (body.caption || '').trim();
      const tag = (body.tag || '📸 Screenshot').trim();

      if (!imageUrl) {
        return res.status(400).json({ error: 'Insira a foto ou o link da imagem para publicar!' });
      }

      if (!caption) {
        return res.status(400).json({ error: 'Escreva uma legenda para a sua foto!' });
      }

      try {
        const newPost = await db.createPost({
          author: {
            steamId: user.steamId || user.steamid,
            name: user.name,
            avatar: (user.avatar || '').replace(/\\\//g, '/')
          },
          imageUrl,
          caption,
          tag
        });

        return res.status(200).json({
          success: true,
          post: newPost
        });
      } catch (e) {
        console.error('[API Feed] Erro ao criar postagem:', e);
        return res.status(500).json({ error: 'Erro ao salvar publicação' });
      }
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
