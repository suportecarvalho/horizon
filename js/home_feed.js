/**
 * home_feed.js — Carrossel das publicações oficiais e da comunidade do Feed Horizon
 * Sincronizado via /api/feed com transição contínua suave e suporte a controles de navegação e toque.
 */
(function() {
  'use strict';

  var AUTO_INTERVAL = 4200; // 4.2 segundos por slide
  var currentIndex = 0;
  var autoTimer = null;
  var isHovered = false;

  // Fallback inicial com as publicações salvas no banco
  var feedPosts = [
    {
      id: "post-1793904452168",
      author: {
        steamId: "76561199523497457",
        name: "Droogos",
        avatar: "https://avatars.fastly.steamstatic.com/2afdcfbcbf848a119cee803d84997946aa16417e_full.jpg"
      },
      imageUrl: "https://rwgswqwqwrnpmcirajre.supabase.co/storage/v1/object/public/feed-photos/uploads/1793904450896_bukcfn.png",
      caption: "Uma fotinha com meu cavalinho",
      tag: "📸 Screenshot",
      createdAt: "2026-11-05T18:47:32.168Z",
      likesCount: 1,
      commentsCount: 2
    },
    {
      id: "post-1793821791738",
      author: {
        steamId: "76561199127717531",
        name: "ADM",
        avatar: "https://avatars.fastly.steamstatic.com/c5ff599f01c1c6496dbb96cc4321283e0b2cd8fd_full.jpg"
      },
      imageUrl: "https://rwgswqwqwrnpmcirajre.supabase.co/storage/v1/object/public/feed-photos/uploads/1793821791209_rfiemo.jpg",
      caption: "Estou de olho kkk",
      tag: "📸 Screenshot",
      createdAt: "2026-11-04T19:49:51.738Z",
      likesCount: 1,
      commentsCount: 1
    },
    {
      id: "post-1793816489953",
      author: {
        steamId: "76561198737554294",
        name: "Delux",
        avatar: "https://avatars.fastly.steamstatic.com/f9e23a80846972e0e7413f970c71b62a23460370_full.jpg"
      },
      imageUrl: "https://rwgswqwqwrnpmcirajre.supabase.co/storage/v1/object/public/feed-photos/uploads/1793816486241_6h42gi.png",
      caption: "O Raid não para!🔥🔥🔥",
      tag: "📸 Screenshot",
      createdAt: "2026-11-04T18:21:29.953Z",
      likesCount: 2,
      commentsCount: 1
    }
  ];

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '';
    }
  }

  function getCardsPerView() {
    var w = window.innerWidth;
    if (w < 640) return 1;
    if (w < 1024) return 2;
    return 3;
  }

  function getMaxIndex() {
    var perView = getCardsPerView();
    return Math.max(0, feedPosts.length - perView);
  }

  function renderFeedCards() {
    var track = document.getElementById('hf-carousel-track');
    if (!track) return;

    if (feedPosts.length === 0) {
      track.innerHTML = '<div style="color:#A1A1AA; padding: 30px; text-align: center; width:100%;">Nenhuma publicação no momento. Seja o primeiro a postar no Feed!</div>';
      return;
    }

    var html = '';
    feedPosts.forEach(function(post, idx) {
      var authorName = (post.author && post.author.name) ? post.author.name : 'Jogador';
      var authorAvatar = (post.author && post.author.avatar) ? post.author.avatar : 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
      var postImage = post.imageUrl || 'https://files.facepunch.com/rust/item/trophy.png';
      var tag = post.tag || '📸 Screenshot';
      var dateText = formatDate(post.createdAt);
      var likes = typeof post.likesCount === 'number' ? post.likesCount : (Array.isArray(post.likes) ? post.likes.length : 0);
      var comments = typeof post.commentsCount === 'number' ? post.commentsCount : (Array.isArray(post.comments) ? post.comments.length : 0);

      html += `
        <article class="hf-card" data-idx="${idx}" style="flex: 0 0 calc((100% - 40px) / 3); min-width: 280px; background: #171312; border: 1px solid rgba(108, 151, 142, 0.28); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55); transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;">
          <div style="position: relative; width: 100%; height: 185px; overflow: hidden; background: #0c0a09;">
            <a href="/feed" style="display: block; width: 100%; height: 100%;">
              <img src="${postImage}" alt="${authorName}" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease;" class="hf-card-img" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            </a>
            <span style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 3px 8px; font-size: 0.7rem; font-weight: 700; color: #EDE8E5; letter-spacing: 0.04em;">
              ${tag}
            </span>
          </div>

          <div style="padding: 18px 20px 20px 20px; display: flex; flex-direction: column; flex-grow: 1;">
            
            <!-- Linha do Autor e Data -->
            <div style="display: flex; align-items: center; gap: 9px; margin-bottom: 12px;">
              <img src="${authorAvatar}" alt="${authorName}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid #6C978E;" onerror="this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'">
              <span style="color: #EDE8E5; font-size: 0.86rem; font-weight: 800; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${authorName}
              </span>
              <time style="font-family: monospace; font-size: 0.72rem; color: #82ADA4; letter-spacing: 0.06em; text-transform: uppercase; margin-left: auto;">
                ${dateText}
              </time>
            </div>

            <!-- Legenda da Publicação -->
            <p style="margin: 0 0 16px 0; font-size: 0.95rem; color: #EDE8E5; line-height: 1.4; font-weight: 600; flex-grow: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px;">
              ${post.caption || 'Sem legenda'}
            </p>

            <!-- Rodapé com Curtidas, Comentários e Link -->
            <div style="margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 14px; font-size: 0.8rem;">
                <span style="display: inline-flex; align-items: center; gap: 5px; color: #EF4444; font-weight: 700;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#EF4444" stroke="#EF4444" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  ${likes}
                </span>
                <span style="display: inline-flex; align-items: center; gap: 5px; color: #82ADA4; font-weight: 700;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                  ${comments}
                </span>
              </div>
              <a href="/feed" style="display: inline-flex; align-items: center; gap: 5px; color: #D7573B; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none;" onmouseover="this.style.color='#ff7b5e'" onmouseout="this.style.color='#D7573B'">
                Ver no Feed
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </a>
            </div>

          </div>
        </article>
      `;
    });

    track.innerHTML = html;
    applyResponsiveCardWidths();
    renderDots();
    updateTrackPosition();
  }

  function applyResponsiveCardWidths() {
    var cards = document.querySelectorAll('.hf-card');
    var w = window.innerWidth;
    var flexBasis = 'calc((100% - 40px) / 3)';
    if (w < 640) {
      flexBasis = '100%';
    } else if (w < 1024) {
      flexBasis = 'calc((100% - 20px) / 2)';
    }
    cards.forEach(function(card) {
      card.style.flex = '0 0 ' + flexBasis;
    });
  }

  function renderDots() {
    var dotsContainer = document.getElementById('hf-carousel-dots');
    if (!dotsContainer) return;
    var max = getMaxIndex();
    if (max <= 0) {
      dotsContainer.innerHTML = '';
      return;
    }

    var html = '';
    for (var i = 0; i <= max; i++) {
      var active = i === currentIndex;
      html += '<button type="button" class="hf-dot" data-dot="' + i + '" aria-label="Slide ' + (i + 1) + '" style="width:' + (active ? '28px' : '8px') + '; height:8px; border-radius:9999px; background:' + (active ? '#D7573B' : 'rgba(255,255,255,0.18)') + '; border:none; padding:0; cursor:pointer; transition:all 0.3s ease;"></button>';
    }
    dotsContainer.innerHTML = html;

    var dots = dotsContainer.querySelectorAll('.hf-dot');
    dots.forEach(function(btn) {
      btn.onclick = function() {
        var idx = parseInt(btn.getAttribute('data-dot'), 10);
        goToSlide(idx);
      };
    });
  }

  function updateTrackPosition() {
    var track = document.getElementById('hf-carousel-track');
    if (!track) return;
    var cards = track.querySelectorAll('.hf-card');
    if (!cards || cards.length === 0) return;

    var cardWidth = cards[0].offsetWidth;
    var gap = 20;
    var offset = currentIndex * (cardWidth + gap);
    track.style.transform = 'translateX(-' + offset + 'px)';

    // Atualiza dots
    var dots = document.querySelectorAll('.hf-dot');
    dots.forEach(function(dot, i) {
      var active = i === currentIndex;
      dot.style.width = active ? '28px' : '8px';
      dot.style.background = active ? '#D7573B' : 'rgba(255,255,255,0.18)';
    });

    // Atualiza botões
    var prevBtn = document.getElementById('hf-prev-btn');
    var nextBtn = document.getElementById('hf-next-btn');
    if (prevBtn) {
      prevBtn.style.opacity = currentIndex === 0 ? '0.45' : '1';
      prevBtn.style.pointerEvents = currentIndex === 0 ? 'none' : 'auto';
    }
    if (nextBtn) {
      var max = getMaxIndex();
      nextBtn.style.opacity = currentIndex >= max ? '0.45' : '1';
      nextBtn.style.pointerEvents = currentIndex >= max ? 'none' : 'auto';
    }
  }

  function goToSlide(idx) {
    var max = getMaxIndex();
    if (idx < 0) idx = 0;
    if (idx > max) idx = max;
    currentIndex = idx;
    updateTrackPosition();
  }

  function nextSlide() {
    var max = getMaxIndex();
    if (currentIndex >= max) {
      currentIndex = 0;
    } else {
      currentIndex++;
    }
    updateTrackPosition();
  }

  function prevSlide() {
    if (currentIndex <= 0) {
      currentIndex = getMaxIndex();
    } else {
      currentIndex--;
    }
    updateTrackPosition();
  }

  function startAuto() {
    stopAuto();
    if (feedPosts.length <= getCardsPerView()) return;
    autoTimer = setInterval(function() {
      if (!isHovered) {
        nextSlide();
      }
    }, AUTO_INTERVAL);
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  // Busca dados dinâmicos da API /api/feed
  async function loadFeedApi() {
    try {
      var res = await fetch('/api/feed');
      if (res.ok) {
        var data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Filtra publicações que possuem imagem
          var validPosts = data.filter(function(p) {
            return p && (p.imageUrl || p.caption);
          });
          if (validPosts.length > 0) {
            feedPosts = validPosts;
            renderFeedCards();
            startAuto();
          }
        }
      }
    } catch (e) {
      // Mantém os dados pré-renderizados
    }
  }

  function init() {
    var prevBtn = document.getElementById('hf-prev-btn');
    var nextBtn = document.getElementById('hf-next-btn');
    var viewport = document.getElementById('hf-carousel-viewport');

    if (prevBtn) prevBtn.onclick = prevSlide;
    if (nextBtn) nextBtn.onclick = nextSlide;

    if (viewport) {
      viewport.onmouseenter = function() { isHovered = true; };
      viewport.onmouseleave = function() { isHovered = false; };

      // Suporte a Touch Swipe
      var touchStartX = 0;
      viewport.ontouchstart = function(e) {
        touchStartX = e.touches[0].clientX;
        isHovered = true;
      };
      viewport.ontouchend = function(e) {
        var touchEndX = e.changedTouches[0].clientX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) nextSlide();
          else prevSlide();
        }
        isHovered = false;
      };
    }

    window.addEventListener('resize', function() {
      applyResponsiveCardWidths();
      renderDots();
      var max = getMaxIndex();
      if (currentIndex > max) currentIndex = max;
      updateTrackPosition();
    });

    renderFeedCards();
    
    // Inicia autoPlay apenas quando o Feed estiver visível na tela (economiza CPU/bateria e melhora o scroll mobile)
    var feedSection = document.getElementById('feed-comunidade') || document.getElementById('hf-carousel-viewport');
    if (feedSection && 'IntersectionObserver' in window) {
      var feedObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (e.isIntersecting && !document.hidden) {
            startAuto();
          } else {
            stopAuto();
          }
        });
      }, { threshold: 0.1 });
      feedObserver.observe(feedSection);
    } else {
      startAuto();
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopAuto();
    });

    loadFeedApi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

