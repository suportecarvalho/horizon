/**
 * Horizon Rust - Sistema de Autenticação Steam OpenID
 * Gerencia a sessão do jogador, badge de perfil no topo (desktop e gaveta mobile) e destaque no ranking.
 */
(function() {
  'use strict';

  // 1. Tenta renderizar imediatamente do cache do localStorage (elimina delay/piscada visual ao navegar entre páginas)
  try {
    const cached = localStorage.getItem('horizon_steam_user');
    if (cached) {
      const u = JSON.parse(cached);
      if (u && (u.steamId || u.steamid)) {
        renderUserHeader(u);
      }
    }
  } catch (e) {}

  async function checkSteamAuth() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const data = await res.json();

      if (!data || !data.authenticated || !data.user) {
        try {
          localStorage.removeItem('horizon_steam_user');
        } catch (e) {}
        resetUserHeader();
        return;
      }

      const user = data.user;
      try {
        localStorage.setItem('horizon_steam_user', JSON.stringify(user));
      } catch (e) {}

      renderUserHeader(user);
      highlightUserInLeaderboards(user.steamId || user.steamid);
      checkWelcomeToast(user);

    } catch (e) {
      console.warn('[Steam Auth] Erro ao verificar sessão:', e);
    }
  }

  function resetUserHeader() {
    const pills = document.querySelectorAll('.horizon-steam-user-pill, .horizon-user-menu-btn, .horizon-mobile-user-card');
    pills.forEach(pill => {
      const isMobile = pill.classList.contains('horizon-mobile-user-card') || pill.closest('.horizon-mobile-auth-slot');
      if (isMobile) {
        const btn = document.createElement('a');
        btn.href = '/auth/steam?redirect=' + encodeURIComponent(window.location.pathname);
        btn.className = 'horizon-mobile-steam-login';
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.8 3.4 8.8 8 9.8v-4.6a2.5 2.5 0 0 1-1.3-.9l-3.3 1.3a4.4 4.4 0 0 1-.4-2.8l2.6-1.1a2.5 2.5 0 0 1 2.4-.7l2.2-3.2A4.2 4.2 0 1 1 16.2 12l-3.2 2.2a2.5 2.5 0 0 1-.7 2.3v.1a2.5 2.5 0 0 1-2.3 2.5v.9c.7.1 1.3.1 2 .1a10 10 0 0 0 10-10A10 10 0 0 0 12 2zm4.2 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>
          </svg>
          <span>Entrar com Steam</span>
        `;
        pill.replaceWith(btn);
      } else {
        const btn = document.createElement('a');
        btn.href = '/auth/steam?redirect=' + encodeURIComponent(window.location.pathname);
        btn.setAttribute('data-slot', 'button');
        btn.setAttribute('data-variant', 'outline');
        btn.setAttribute('data-size', 'cabecalho');
        btn.className = "horizon-auth-desktop group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 btn-corte [--corte:8px] h-8 gap-1.5 px-3.5 font-heading text-[0.7rem] font-bold tracking-[0.06em] uppercase";
        btn.innerHTML = 'Entrar<span class="some-no-estreito">&nbsp;com Steam</span>';
        pill.replaceWith(btn);
      }
    });

    document.querySelectorAll('.site-header-direita .horizon-mobile-toggle:not(.horizon-user-menu-btn)').forEach(el => {
      el.style.display = '';
    });
  }

  function renderUserHeader(user) {
    const steamButtons = document.querySelectorAll('a[href="/auth/steam"], a[href^="/auth/steam"], .horizon-mobile-steam-login');
    
    steamButtons.forEach(btn => {
      const isMobile = btn.classList.contains('horizon-mobile-steam-login') || btn.closest('.horizon-mobile-auth-slot');
      const avatarSrc = (user.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/');
      const isAdm = user.isAdmin || user.steamId === '76561198737554294' || user.steamid === '76561198737554294';

      if (isMobile) {
        const card = document.createElement('div');
        card.className = 'horizon-mobile-user-card';
        card.innerHTML = `
          <div class="horizon-mobile-user-top">
            <div class="horizon-mobile-avatar-wrap">
              <img src="${avatarSrc}" alt="${user.name}" class="horizon-mobile-avatar" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';">
              <span class="horizon-mobile-status-dot"></span>
            </div>
            <div class="horizon-mobile-user-info">
              <div class="horizon-mobile-user-name-row">
                <span class="horizon-mobile-user-name">${user.name}</span>
                ${isAdm ? `<span class="horizon-adm-badge">ADM</span>` : ''}
              </div>
              <span class="horizon-mobile-user-status">Conectado via Steam</span>
            </div>
          </div>
          <a href="/auth/logout" class="horizon-mobile-logout-btn" onclick="try{localStorage.removeItem('horizon_steam_user');}catch(e){}" title="Sair da conta Steam">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span>Desconectar</span>
          </a>
        `;
        btn.replaceWith(card);
      } else {
        const wrapper = document.createElement('button');
        wrapper.type = 'button';
        wrapper.className = 'horizon-user-menu-btn';
        wrapper.setAttribute('aria-label', 'Menu da conta e navegação');
        wrapper.setAttribute('aria-expanded', 'false');
        wrapper.setAttribute('aria-controls', 'horizon-mobile-drawer');

        wrapper.innerHTML = `
          <div class="horizon-user-avatar-wrap">
            <img src="${avatarSrc}" alt="${user.name}" class="horizon-user-avatar ${isAdm ? 'is-admin' : ''}" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';">
            <span class="horizon-user-status-dot"></span>
          </div>
          <span class="horizon-user-name">${user.name}</span>
          ${isAdm ? `<span class="horizon-adm-badge">ADM</span>` : ''}
          <span class="horizon-toggle-bars" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        `;

        const parent = btn.parentElement;
        btn.replaceWith(wrapper);

        // Oculta o toggle avulso do mesmo header se existir para não duplicar o menu sanduíche
        if (parent) {
          const siblingToggle = parent.querySelector('.horizon-mobile-toggle:not(.horizon-user-menu-btn)');
          if (siblingToggle) {
            siblingToggle.style.display = 'none';
          }
        }
      }
    });
  }

  function highlightUserInLeaderboards(mySteamId) {
    if (!mySteamId) return;

    function applyHighlight() {
      const rows = document.querySelectorAll('.ranking-linha, #hlb-table-body tr');
      rows.forEach(row => {
        const text = row.textContent || '';
        if (text.includes(mySteamId)) {
          row.style.background = 'rgba(108, 151, 142, 0.15)';
          row.style.borderLeft = '3px solid #6C978E';
          
          const nameEl = row.querySelector('.ranking-nome, .hlb-player-name');
          if (nameEl && !nameEl.querySelector('.horizon-you-badge')) {
            const badge = document.createElement('span');
            badge.className = 'horizon-you-badge';
            badge.style.cssText = 'background: rgba(108,151,142,0.3); border: 1px solid #6C978E; color: #82ADA4; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; font-weight: 800; margin-left: 6px; letter-spacing: 0.05em; vertical-align: middle; display: inline-block;';
            badge.textContent = 'VOCÊ';
            nameEl.appendChild(badge);
          }
        }
      });
    }

    applyHighlight();
    const observer = new MutationObserver(applyHighlight);
    const tbody = document.querySelector('table.ranking-tabela tbody, #hlb-table-body');
    if (tbody) {
      observer.observe(tbody, { childList: true });
    }
  }

  function checkWelcomeToast(user) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #181514;
        border: 1px solid #6C978E;
        color: #EDE8E5;
        padding: 12px 18px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        z-index: 99999;
        font-family: inherit;
        animation: slideInToast 0.35s ease-out;
      `;

      toast.innerHTML = `
        <img src="${(user.avatar || '').replace(/\\\//g, '/')}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid #22c55e;">
        <div>
          <div style="font-weight: 800; font-size: 0.85rem; color: #22c55e;">Logado com a Steam!</div>
          <div style="font-size: 0.8rem; color: #a1a1aa;">Bem-vindo(a), <strong style="color:#EDE8E5;">${user.name}</strong></div>
        </div>
      `;

      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }, 4500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSteamAuth);
  } else {
    checkSteamAuth();
  }
})();
