/**
 * Horizon Rust - Sistema de Autenticação Steam OpenID
 * Gerencia a sessão do jogador, badge de perfil no topo e destaque no ranking.
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
    const pills = document.querySelectorAll('.horizon-steam-user-pill');
    pills.forEach(pill => {
      const btn = document.createElement('a');
      btn.href = '/auth/steam?redirect=' + encodeURIComponent(window.location.pathname);
      btn.setAttribute('data-slot', 'button');
      btn.setAttribute('data-variant', 'outline');
      btn.setAttribute('data-size', 'cabecalho');
      btn.className = "group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 btn-corte [--corte:8px] h-8 gap-1.5 px-3.5 font-heading text-[0.7rem] font-bold tracking-[0.06em] uppercase";
      btn.innerHTML = 'Entrar<span class="some-no-estreito">&nbsp;com Steam</span>';
      pill.replaceWith(btn);
    });
  }

  function renderUserHeader(user) {
    const steamButtons = document.querySelectorAll('a[href="/auth/steam"], a[href^="/auth/steam"]');
    
    steamButtons.forEach(btn => {
      const wrapper = document.createElement('div');
      wrapper.className = 'horizon-steam-user-pill';
      wrapper.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 9px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 4px 10px 4px 5px;
        border-radius: 9999px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        transition: all 0.2s ease;
      `;

      const avatarSrc = (user.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/');
      const isAdm = user.isAdmin || user.steamId === '76561198737554294' || user.steamid === '76561198737554294';

      wrapper.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <img src="${avatarSrc}" alt="${user.name}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${isAdm ? '#D7573B' : '#6C978E'}; display: block;" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';">
          <span style="position: absolute; bottom: -1px; right: -1px; width: 8px; height: 8px; background: #22c55e; border-radius: 50%; border: 1.5px solid #13100F;"></span>
        </div>
        <span style="color: #EDE8E5; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.02em; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${user.name}
        </span>
        ${isAdm ? `<span style="background: rgba(215, 87, 59, 0.35); border: 1px solid #D7573B; color: #ff8b70; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; font-weight: 800; letter-spacing: 0.05em;">ADM</span>` : ''}
        <a href="/auth/logout" onclick="try{localStorage.removeItem('horizon_steam_user');}catch(e){}" title="Sair da conta Steam" style="color: #71717a; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; text-decoration: none; transition: all 0.2s ease; margin-left: 2px;" onmouseover="this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.color='#71717a';this.style.background='transparent'">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </a>
      `;

      btn.replaceWith(wrapper);
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
