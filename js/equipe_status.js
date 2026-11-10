/**
 * equipe_status.js — Atualiza disponibilidade em tempo real da equipe Horizon via Steam
 */
(function() {
  'use strict';

  async function updateEquipeStatus() {
    try {
      const res = await fetch('/api/equipe');
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.members) return;

      const wraps = document.querySelectorAll('.equipe-avatar-wrap[data-steamid]');
      wraps.forEach(wrap => {
        const steamId = wrap.getAttribute('data-steamid');
        const info = data.members[steamId];
        if (!info) return;

        const dot = wrap.querySelector('.equipe-status-dot');
        if (dot) {
          dot.className = 'equipe-status-dot is-' + (info.state || 'offline');
          dot.setAttribute('title', info.label || 'Offline na Steam');
        }

        const img = wrap.querySelector('.equipe-avatar-img');
        if (img && info.avatar) {
          img.src = info.avatar;
        }
      });
    } catch (e) {
      console.warn('[Equipe Status] Falha ao atualizar status:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateEquipeStatus);
  } else {
    updateEquipeStatus();
  }
})();

