/**
 * Feed Horizon - Script Frontend da Rede Social Steam
 */
(function() {
  'use strict';

  let currentUser = null;
  let allPosts = [];
  let selectedFileBase64 = null;
  let selectedFileObj = null;

  // Elementos do DOM
  const guestBox = document.getElementById('feed-guest-box');
  const createBox = document.getElementById('feed-create-box');
  const myAvatar = document.getElementById('my-avatar');
  const myName = document.getElementById('my-name');
  const postCaption = document.getElementById('post-caption');
  const postImageUrl = document.getElementById('post-image-url');
  const postFileInput = document.getElementById('post-file-input');
  const previewContainer = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('image-preview-img');
  const previewRemoveBtn = document.getElementById('preview-remove-btn');
  const btnSubmitPost = document.getElementById('btn-submit-post');
  const createPostMsg = document.getElementById('create-post-msg');
  const feedTotalCount = document.getElementById('feed-total-count');
  const postsStream = document.getElementById('feed-posts-stream');
  const lightboxModal = document.getElementById('feed-lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const toastEl = document.getElementById('feed-toast');

  // Elementos do Modal de Edição
  const editModal = document.getElementById('feed-edit-modal');
  const editPostId = document.getElementById('edit-post-id');
  const editPostCaption = document.getElementById('edit-post-caption');
  const editModalClose = document.getElementById('edit-modal-close');
  const editModalCancel = document.getElementById('edit-modal-cancel');
  const editModalSave = document.getElementById('edit-modal-save');

  // Inicialização
  async function init() {
    setupEventListeners();
    await checkAuth();
    await fetchPosts();
  }

  // Verifica sessão Steam atual
  async function checkAuth() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          currentUser = data.user;
          renderAuthenticatedUser();
          return;
        }
      }
    } catch (e) {
      console.warn('[Feed] Erro ao verificar sessão:', e);
    }
    renderGuest();
  }

  function renderAuthenticatedUser() {
    if (guestBox) guestBox.style.display = 'none';
    if (createBox) createBox.style.display = 'block';

    const avatar = (currentUser.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/');
    if (myAvatar) {
      myAvatar.src = avatar;
      myAvatar.alt = currentUser.name;
    }
    if (myName) {
      myName.textContent = currentUser.name;
    }
  }

  function renderGuest() {
    if (guestBox) guestBox.style.display = 'flex';
    if (createBox) createBox.style.display = 'none';
  }

  // Busca lista de posts
  async function fetchPosts() {
    try {
      postsStream.innerHTML = `
        <div style="text-align: center; padding: 48px 0; color: #71717a;">
          <svg style="animation: spin 1s linear infinite; display: inline-block; width: 32px; height: 32px; margin-bottom: 12px; color: #D7573B;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <div style="font-weight: 700; font-size: 0.95rem;">Carregando publicações do Feed...</div>
        </div>
      `;

      const res = await fetch('/api/feed');
      if (!res.ok) throw new Error('Falha ao carregar feed');
      allPosts = await res.json();
      renderFeed();
    } catch (e) {
      console.error('[Feed] Erro ao carregar posts:', e);
      postsStream.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; background: #171312; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;">
          <p style="color: #ef4444; font-weight: 700; margin-bottom: 12px;">Não foi possível carregar as publicações no momento.</p>
          <button onclick="window.location.reload()" style="background: #27272a; color: #EDE8E5; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer;">Tentar novamente</button>
        </div>
      `;
    }
  }

  // Renderiza publicações filtradas
  function renderFeed() {
    if (feedTotalCount) {
      feedTotalCount.textContent = `${allPosts.length} ${allPosts.length === 1 ? 'publicação' : 'publicações'}`;
    }

    if (!allPosts || allPosts.length === 0) {
      postsStream.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: #171312; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">📸</div>
          <h3 style="margin: 0 0 6px; font-weight: 800; font-size: 1.1rem; color: #EDE8E5;">Nenhuma publicação ainda</h3>
          <p style="margin: 0; color: #71717a; font-size: 0.9rem;">Seja o primeiro sobrevivente a postar no feed!</p>
        </div>
      `;
      return;
    }

    const mySteamId = currentUser ? (currentUser.steamId || currentUser.steamid) : null;
    const userIsAdmin = currentUser && (currentUser.isAdmin || currentUser.steamId === '76561198737554294' || currentUser.steamid === '76561198737554294');

    postsStream.innerHTML = allPosts.map(post => {
      const likes = Array.isArray(post.likes) ? post.likes : [];
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const hasLiked = mySteamId && likes.includes(mySteamId);
      const authorAvatar = (post.author?.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/');
      const authorName = escapeHtml(post.author?.name || 'Jogador');
      const authorSteamId = post.author?.steamId || post.author?.steamid || '';
      const isAuthor = mySteamId && (authorSteamId === mySteamId);
      const canManage = userIsAdmin || isAuthor;
      const dateText = formatDate(post.createdAt);

      return `
        <article class="feed-card" id="${post.id}">
          <!-- CABEÇALHO DO CARD -->
          <div class="feed-card-header">
            <a href="/leaderboards/${authorSteamId}" class="feed-author-box">
              <img src="${authorAvatar}" alt="${authorName}" class="feed-author-avatar" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';">
              <div>
                <span class="feed-author-name">
                  ${authorName}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af" style="display:inline-block; vertical-align:middle; margin-left:3px;"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.707 7.707a1 1 0 00-1.414-1.414L10 13.586l-2.293-2.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l6-6z"/></svg>
                </span>
                <span class="feed-post-meta">${dateText}</span>
              </div>
            </a>
            
            ${canManage ? `
              <div style="display: inline-flex; align-items: center; gap: 8px;">
                <button type="button" title="Editar publicação" onclick="window.feedApp.openEditModal('${post.id}')" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; border-radius: 8px; padding: 6px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.color='#ffffff';this.style.borderColor='rgba(255,255,255,0.25)'" onmouseout="this.style.color='#a1a1aa';this.style.borderColor='rgba(255,255,255,0.1)'">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <span>Editar</span>
                </button>
                <button type="button" title="Excluir publicação" onclick="window.feedApp.deletePost('${post.id}')" style="background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; border-radius: 8px; padding: 6px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.15)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.06)'">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Excluir</span>
                </button>
              </div>
            ` : ''}
          </div>

          <!-- MÍDIA / IMAGEM -->
          <div class="feed-card-media" onclick="window.feedApp.openLightbox('${escapeHtml(post.imageUrl)}', '${escapeHtml(post.caption || '')}')">
            <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.caption || 'Print Rust')}" loading="lazy" onerror="this.src='https://files.facepunch.com/lewis/2026/August/pt_hero.jpg'">
          </div>

          <!-- CORPO & LEGENDA -->
          <div class="feed-card-body">
            <div class="feed-card-caption">${escapeHtml(post.caption || '')}</div>

            <!-- AÇÕES (CURTIR, COMENTAR, COMPARTILHAR) -->
            <div class="feed-card-actions">
              <div style="display: flex; align-items: center; gap: 20px;">
                <button type="button" class="feed-action-btn ${hasLiked ? 'liked' : ''}" onclick="window.feedApp.toggleLike('${post.id}')" id="like-btn-${post.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${hasLiked ? '#ef4444' : 'none'}" stroke="${hasLiked || likes.length > 0 ? '#ef4444' : '#a1a1aa'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  <span class="likes-count" style="color: ${hasLiked || likes.length > 0 ? '#f87171' : '#a1a1aa'}; font-weight: 700;">${likes.length} curtida${likes.length === 1 ? '' : 's'}</span>
                </button>

                <button type="button" class="feed-action-btn" onclick="window.feedApp.toggleComments('${post.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                  <span style="color: #a1a1aa; font-weight: 600;">${comments.length} comentário${comments.length === 1 ? '' : 's'}</span>
                </button>
              </div>

              <button type="button" class="feed-action-btn" onclick="window.feedApp.sharePost('${post.id}')" title="Compartilhar">
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              </button>
            </div>
          </div>

          <!-- SEÇÃO DE COMENTÁRIOS -->
          <div class="feed-comments-section" id="comments-sec-${post.id}">
            <div id="comments-list-${post.id}">
              ${comments.map(c => {
                const commentSteamId = c.author?.steamId || c.author?.steamid || '';
                const canDeleteC = userIsAdmin || isAuthor || (mySteamId && commentSteamId === mySteamId);

                return `
                  <div class="feed-comment-item">
                    <img src="${(c.author?.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/')}" alt="${escapeHtml(c.author?.name || 'Jogador')}" class="feed-comment-avatar">
                    <div class="feed-comment-content">
                      <div class="feed-comment-user">
                        <span class="feed-comment-author-name">${escapeHtml(c.author?.name || 'Jogador')}</span>
                        <span class="feed-comment-separator">•</span>
                        <span class="feed-comment-time">${formatDate(c.createdAt)}</span>
                      </div>
                      <div class="feed-comment-text">${escapeHtml(c.text || '')}</div>
                    </div>
                    ${canDeleteC ? `
                      <button type="button" title="Excluir comentário" onclick="window.feedApp.deleteComment('${post.id}', '${c.id}')" style="background: transparent; border: none; color: #71717a; cursor: pointer; padding: 4px; font-size: 0.9rem; line-height: 1; margin-left: 8px; transition: color 0.15s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#71717a'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>

            <!-- CAMPO PARA COMENTAR -->
            <div class="feed-comment-input-box">
              <input type="text" id="comment-input-${post.id}" class="feed-comment-input" placeholder="Escreva um comentário com emojis..." onkeydown="if(event.key==='Enter') window.feedApp.submitComment('${post.id}')">
              <button type="button" class="feed-comment-submit" onclick="window.feedApp.submitComment('${post.id}')">Enviar</button>
            </div>

            <!-- BARRA DE EMOJIS RÁPIDOS -->
            <div class="feed-comment-emoji-bar" style="display: flex; align-items: center; gap: 5px; margin-top: 8px; flex-wrap: wrap;">
              <span style="font-size: 0.72rem; color: #71717a; font-weight: 700; text-transform: uppercase; margin-right: 4px; display: inline-flex; align-items: center; gap: 3px;">
                <span>😊</span> Emojis:
              </span>
              ${['🔥', '😂', '👀', '❤️', '💀', '👍', '👏', '🎯', '⚡', '👑', '🚀', '💣', '😎', '🏆', '⛏️'].map(emoji => `
                <button type="button" class="feed-emoji-btn" onclick="window.feedApp.insertEmoji('${post.id}', '${emoji}')" title="Adicionar ${emoji}" style="
                  background: rgba(255, 255, 255, 0.04);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 8px;
                  padding: 3px 8px;
                  font-size: 1rem;
                  line-height: 1.2;
                  cursor: pointer;
                  transition: transform 0.15s ease, background 0.15s ease;
                " onmouseover="this.style.background='rgba(255,255,255,0.12)';this.style.transform='scale(1.18)'" onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.transform='scale(1)'">
                  ${emoji}
                </button>
              `).join('')}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // Ação: Curtir / Descurtir
  async function toggleLike(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;

    // Obtém identificador único (SteamID se logado, ou guestId persistente no localStorage)
    let myId = currentUser ? (currentUser.steamId || currentUser.steamid) : null;
    if (!myId) {
      myId = localStorage.getItem('horizon_guest_id');
      if (!myId) {
        myId = 'guest_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('horizon_guest_id', myId);
      }
    }

    if (!Array.isArray(post.likes)) post.likes = [];

    // Otimista: alterna o like localmente na hora
    const idx = post.likes.indexOf(myId);
    let isNowLiked = false;
    if (idx >= 0) {
      post.likes.splice(idx, 1);
      isNowLiked = false;
    } else {
      post.likes.push(myId);
      isNowLiked = true;
    }
    updateLikeButton(post, isNowLiked, post.likes.length);

    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like', postId, guestId: myId, steamId: myId })
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.likesCount === 'number') {
          if (data.hasLiked && !post.likes.includes(myId)) post.likes.push(myId);
          if (!data.hasLiked) {
            const i = post.likes.indexOf(myId);
            if (i >= 0) post.likes.splice(i, 1);
          }
          updateLikeButton(post, data.hasLiked, data.likesCount);
        }
      }
    } catch (e) {
      console.warn('[Feed] Erro ao enviar like:', e);
    }
  }

  function updateLikeButton(post, forcedLikedState, forcedCount) {
    const btn = document.getElementById(`like-btn-${post.id}`);
    if (!btn) return;

    let myId = currentUser ? (currentUser.steamId || currentUser.steamid) : localStorage.getItem('horizon_guest_id');
    const hasLiked = forcedLikedState !== undefined ? forcedLikedState : (myId && post.likes.includes(myId));
    const count = forcedCount !== undefined ? forcedCount : post.likes.length;

    const svg = btn.querySelector('svg');
    const counter = btn.querySelector('.likes-count');

    if (hasLiked) {
      btn.classList.add('liked');
      if (svg) {
        svg.setAttribute('fill', '#ef4444');
        svg.setAttribute('stroke', '#ef4444');
      }
      if (counter) {
        counter.style.color = '#f87171';
      }
    } else {
      btn.classList.remove('liked');
      if (svg) {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', count > 0 ? '#ef4444' : '#a1a1aa');
      }
      if (counter) {
        counter.style.color = count > 0 ? '#f87171' : '#a1a1aa';
      }
    }

    if (counter) {
      counter.textContent = `${count} curtida${count === 1 ? '' : 's'}`;
    }
  }

  // Insere emoji no campo de comentário do post
  function insertEmoji(postId, emoji) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;
    input.value = val.substring(0, start) + emoji + val.substring(end);
    input.focus();
    const nextPos = start + emoji.length;
    input.setSelectionRange(nextPos, nextPos);
  }

  // Ação: Comentar
  async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    let authorName = currentUser ? (currentUser.name || currentUser.username) : localStorage.getItem('horizon_author_name');
    if (!currentUser && !authorName) {
      authorName = prompt('Informe seu nome de jogador para comentar:') || 'Jogador';
      if (authorName) localStorage.setItem('horizon_author_name', authorName);
    }

    let guestId = localStorage.getItem('horizon_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('horizon_guest_id', guestId);
    }

    input.value = '';
    input.disabled = true;

    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'comment',
          postId,
          text,
          authorName: authorName || 'Jogador',
          guestId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.comment) {
          const post = allPosts.find(p => p.id === postId);
          if (post) {
            if (!Array.isArray(post.comments)) post.comments = [];
            post.comments.push(data.comment);
          }

          // Adiciona no DOM
          const list = document.getElementById(`comments-list-${postId}`);
          if (list) {
            const commentItem = document.createElement('div');
            commentItem.className = 'feed-comment-item';
            commentItem.innerHTML = `
              <img src="${(data.comment.author?.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/')}" alt="${escapeHtml(data.comment.author?.name || 'Jogador')}" class="feed-comment-avatar">
              <div class="feed-comment-content">
                <div class="feed-comment-user">
                  <span class="feed-comment-author-name">${escapeHtml(data.comment.author?.name || 'Jogador')}</span>
                  <span class="feed-comment-separator">•</span>
                  <span class="feed-comment-time">agora mesmo</span>
                </div>
                <div class="feed-comment-text">${escapeHtml(data.comment.text || '')}</div>
              </div>
            `;
            list.appendChild(commentItem);
          }
        }
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao enviar comentário');
      }
    } catch (e) {
      console.error('[Feed] Erro ao comentar:', e);
      showToast('Erro de conexão ao comentar.');
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // Ação: Criar Postagem
  async function handleCreatePost() {
    if (!currentUser) {
      showToast('⚠️ Entre com a Steam para publicar!');
      return;
    }

    const caption = (postCaption.value || '').trim();
    let imageUrl = (postImageUrl.value || '').trim();

    if (!imageUrl && !selectedFileBase64) {
      showMessage('Insira a URL de uma foto ou escolha uma do seu PC para publicar.', true);
      postImageUrl.focus();
      return;
    }

    if (!caption) {
      showMessage('Escreva uma legenda ou história sobre sua foto.', true);
      postCaption.focus();
      return;
    }

    btnSubmitPost.disabled = true;
    btnSubmitPost.innerHTML = `
      <svg style="animation: spin 1s linear infinite; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      Publicando...
    `;

    try {
      // Se tiver arquivo selecionado do PC, tenta upload no Supabase Storage
      if (selectedFileBase64) {
        try {
          const uploadRes = await fetch('/api/feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload',
              image: selectedFileBase64,
              filename: selectedFileObj ? selectedFileObj.name : `print_${Date.now()}.jpg`,
              mimeType: selectedFileObj ? selectedFileObj.type : 'image/jpeg'
            })
          });

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            if (uploadData.success && uploadData.url) {
              imageUrl = uploadData.url;
            } else {
              imageUrl = selectedFileBase64;
            }
          } else {
            imageUrl = selectedFileBase64;
          }
        } catch (upErr) {
          imageUrl = selectedFileBase64;
        }
      }

      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          caption,
          imageUrl
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.post) {
          allPosts.unshift(data.post);
          renderFeed();

          // Limpa formulário
          postCaption.value = '';
          postImageUrl.value = '';
          selectedFileBase64 = null;
          selectedFileObj = null;
          if (postFileInput) postFileInput.value = '';
          previewContainer.style.display = 'none';
          previewImg.src = '';
          showMessage('Publicação enviada com sucesso ao Feed Horizon! 🔥', false);
          showToast('🎉 Sua foto foi publicada no Feed!');
        }
      } else {
        const err = await res.json();
        showMessage(err.error || 'Erro ao publicar.', true);
      }
    } catch (e) {
      console.error('[Feed] Erro ao criar post:', e);
      showMessage('Erro de conexão ao publicar.', true);
    } finally {
      btnSubmitPost.disabled = false;
      btnSubmitPost.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
        Publicar no Feed
      `;
    }
  }

  function showMessage(text, isError) {
    if (!createPostMsg) return;
    createPostMsg.textContent = text;
    createPostMsg.style.color = isError ? '#ef4444' : '#22c55e';
    createPostMsg.style.display = 'block';
    setTimeout(() => {
      createPostMsg.style.display = 'none';
    }, 5000);
  }

  // Lightbox Modal
  function openLightbox(imgSrc, caption) {
    if (!lightboxModal) return;
    lightboxImg.src = imgSrc;
    lightboxCaption.textContent = caption || '';
    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('active');
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  // Compartilhar post
  function sharePost(postId) {
    const url = `${window.location.origin}/feed#${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('🔗 Link da publicação copiado!');
    }).catch(() => {
      showToast('Link: ' + url);
    });
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3200);
  }

  // Utilitários de Data & Escape
  function formatDate(isoStr) {
    if (!isoStr) return 'recentemente';
    try {
      const d = new Date(isoStr);
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffMin < 2) return 'agora mesmo';
      if (diffMin < 60) return `há ${diffMin} min`;
      if (diffHrs < 24) return `há ${diffHrs}h`;
      if (diffDays === 1) return 'ontem';
      if (diffDays < 7) return `há ${diffDays} dias`;

      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'recentemente';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Event Listeners
  function setupEventListeners() {
    // URL input preview
    if (postImageUrl) {
      postImageUrl.addEventListener('input', () => {
        const val = postImageUrl.value.trim();
        if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
          selectedFileBase64 = null;
          selectedFileObj = null;
          previewImg.src = val;
          previewContainer.style.display = 'block';
        } else if (!selectedFileBase64) {
          previewContainer.style.display = 'none';
        }
      });
    }

    // Input de arquivo do PC
    if (postFileInput) {
      postFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
          showToast('⚠️ A imagem deve ter no máximo 8MB.');
          return;
        }

        selectedFileObj = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
          selectedFileBase64 = ev.target.result;
          previewImg.src = selectedFileBase64;
          previewContainer.style.display = 'block';
          postImageUrl.value = file.name;
        };
        reader.readAsDataURL(file);
      });
    }

    if (previewRemoveBtn) {
      previewRemoveBtn.addEventListener('click', () => {
        postImageUrl.value = '';
        selectedFileBase64 = null;
        selectedFileObj = null;
        if (postFileInput) postFileInput.value = '';
        previewContainer.style.display = 'none';
        previewImg.src = '';
      });
    }

    // Botão Submit Post
    if (btnSubmitPost) {
      btnSubmitPost.addEventListener('click', handleCreatePost);
    }

    if (editModalClose) editModalClose.addEventListener('click', closeEditModal);
    if (editModalCancel) editModalCancel.addEventListener('click', closeEditModal);
    if (editModalSave) editModalSave.addEventListener('click', submitEditPost);
    if (editModal) {
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
      });
    }

    // Lightbox
    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }
    if (lightboxModal) {
      lightboxModal.addEventListener('click', (e) => {
        if (e.target === lightboxModal) closeLightbox();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeEditModal();
      }
    });
  }

  // Funções de Edição e Exclusão (Admin / Autor)
  function openEditModal(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post || !editModal) return;

    editPostId.value = post.id;
    editPostCaption.value = post.caption || '';

    editModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeEditModal() {
    if (!editModal) return;
    editModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  async function submitEditPost() {
    const postId = editPostId.value;
    const caption = (editPostCaption.value || '').trim();

    if (!caption) {
      showToast('⚠️ A legenda não pode estar vazia.');
      return;
    }

    editModalSave.disabled = true;
    editModalSave.textContent = 'Salvando...';

    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          postId,
          caption
        })
      });

      if (res.ok) {
        const post = allPosts.find(p => p.id === postId);
        if (post) {
          post.caption = caption;
        }
        closeEditModal();
        renderFeed();
        showToast('✅ Publicação atualizada com sucesso!');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao editar publicação.');
      }
    } catch (e) {
      showToast('Erro de conexão ao editar.');
    } finally {
      editModalSave.disabled = false;
      editModalSave.textContent = 'Salvar Alterações';
    }
  }

  async function deletePost(postId) {
    if (!confirm('Tem certeza que deseja excluir esta publicação do Feed? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', postId })
      });

      if (res.ok) {
        allPosts = allPosts.filter(p => p.id !== postId);
        renderFeed();
        showToast('🗑️ Publicação excluída com sucesso!');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao excluir publicação.');
      }
    } catch (e) {
      showToast('Erro de conexão ao excluir.');
    }
  }

  async function deleteComment(postId, commentId) {
    if (!confirm('Deseja excluir este comentário?')) return;

    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_comment', postId, commentId })
      });

      if (res.ok) {
        const post = allPosts.find(p => p.id === postId);
        if (post && Array.isArray(post.comments)) {
          post.comments = post.comments.filter(c => c.id !== commentId);
        }
        renderFeed();
        showToast('🗑️ Comentário excluído.');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao excluir comentário.');
      }
    } catch (e) {
      showToast('Erro de conexão ao excluir comentário.');
    }
  }

  // Exporta métodos globais para inline onclicks
  window.feedApp = {
    toggleLike,
    submitComment,
    insertEmoji,
    openLightbox,
    openEditModal,
    closeEditModal,
    deletePost,
    deleteComment,
    sharePost,
    toggleComments: (id) => {
      const sec = document.getElementById(`comments-sec-${id}`);
      if (sec) {
        sec.style.display = (sec.style.display === 'none') ? 'block' : 'none';
      }
    }
  };

  // Inicia quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
