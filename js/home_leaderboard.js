/**
 * Horizon Rust Leaderboard - Integração em tempo real com o servidor
 */
(function() {
  let currentTab = 'pvp';
  let cachedLbData = null;

  async function fetchLeaderboardData() {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        cachedLbData = await res.json();
        renderHomeLeaderboard();
      }
    } catch (e) {
      console.warn('[HorizonLeaderboard] Conexão com a API offline ou lenta:', e.message);
    }
  }

  function getMedal(rank) {
    if (rank === 1) {
      return `
        <span style="display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
          <strong style="color: #eab308; font-size: 0.95rem; font-weight: 800;">1</strong>
        </span>
      `;
    }
    if (rank === 2) {
      return `
        <span style="display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
          <strong style="color: #94a3b8; font-size: 0.95rem; font-weight: 800;">2</strong>
        </span>
      `;
    }
    if (rank === 3) {
      return `
        <span style="display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
          <strong style="color: #d97706; font-size: 0.95rem; font-weight: 800;">3</strong>
        </span>
      `;
    }
    return `<span style="color: #71717a; font-weight: 800; font-size: 0.95rem;">${rank}</span>`;
  }

  function getAvatar(item) {
    const initial = item.name ? item.name.trim().charAt(0).toUpperCase() : 'H';
    const isCustom = item.avatar && 
      !item.avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb') &&
      !item.avatar.includes('default');

    if (isCustom) {
      return `<img src="${item.avatar}" alt="${item.name || ''}" class="hlb-avatar-img">`;
    }
    return `<span class="hlb-avatar-fallback">${initial}</span>`;
  }

  function renderHomeLeaderboard() {
    if (!cachedLbData) return;

    const searchInput = document.getElementById('hlb-search-input');
    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const list = cachedLbData[currentTab] || [];
    
    const filtered = list.filter(function(item) {
      if (!searchTerm) return true;
      const n = (item.name || '').toLowerCase();
      const s = (item.steamid || '').toLowerCase();
      return n.includes(searchTerm) || s.includes(searchTerm);
    });

    const totalEl = document.getElementById('hlb-wipe-count');
    if (totalEl) {
      const totalWipe = cachedLbData.wipe_total_players || list.length || 138;
      totalEl.textContent = searchTerm 
        ? filtered.length + ' jogadores encontrados' 
        : totalWipe + ' jogadores neste wipe';
    }

    const thead = document.getElementById('hlb-table-head');
    if (thead) {
      if (currentTab === 'pvp') {
        thead.innerHTML = `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.28);">
            <th style="padding: 16px 12px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; width: 60px;">#</th>
            <th style="padding: 16px 14px; text-align: left; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">JOGADOR</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">KDR</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">% HS</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">KILLS</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">MORTES EM PVP</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">HEADSHOTS</th>
          </tr>
        `;
      } else if (currentTab === 'recursos') {
        thead.innerHTML = `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.28);">
            <th style="padding: 16px 12px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; width: 60px;">#</th>
            <th style="padding: 16px 14px; text-align: left; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">JOGADOR</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">TOTAL</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">ENXOFRE</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">METAL</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">PEDRA</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">SCRAP</th>
          </tr>
        `;
      } else if (currentTab === 'farming') {
        thead.innerHTML = `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.28);">
            <th style="padding: 16px 12px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; width: 60px;">#</th>
            <th style="padding: 16px 14px; text-align: left; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">JOGADOR</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">CLONES</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">BERRIES</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">TECIDO</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">PEIXES</th>
            <th style="padding: 16px 14px; text-align: center; color: #82ADA4; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">BATATAS</th>
          </tr>
        `;
      }
    }

    const tbody = document.getElementById('hlb-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #a1a1aa; font-weight: 600;">Nenhum jogador encontrado para a busca.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.slice(0, 15).map(function(item) {
      let extraCols = '';
      if (currentTab === 'pvp') {
        const hsVal = item.headshots !== undefined ? item.headshots : (item.distance || '-');
        extraCols = `
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #D7573B; font-weight: 900; font-size: 1.05rem;">${item.kd}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.headshot_pct}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 800;">${item.kills}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.deaths}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${hsVal}</td>
        `;
      } else if (currentTab === 'recursos') {
        extraCols = `
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #D7573B; font-weight: 900; font-size: 1.05rem;">${item.total}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #f59e0b; font-weight: 700;">${item.sulfur}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #60a5fa; font-weight: 700;">${item.metal}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.stone}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #34d399; font-weight: 700;">${item.scrap}</td>
        `;
      } else if (currentTab === 'farming') {
        extraCols = `
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #D7573B; font-weight: 900; font-size: 1.05rem;">${item.clones}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.berries}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.cloth}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #38bdf8; font-weight: 700;">${item.fish}</td>
          <td style="padding: 16px 14px; text-align: center; vertical-align: middle; color: #EDE8E5; font-weight: 700;">${item.potatoes}</td>
        `;
      }

      return `
        <tr class="hlb-row" style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s ease;">
          <td style="padding: 16px 12px; text-align: center; vertical-align: middle;">${getMedal(item.rank)}</td>
          <td style="padding: 16px 14px; vertical-align: middle;">
            <div style="display: flex; align-items: center; gap: 14px;">
              ${getAvatar(item)}
              <div style="display: flex; flex-direction: column; min-width: 0;">
                <strong style="color: #FFFFFF; font-size: 0.94rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase;">${item.name || ''}</strong>
                <span style="color: #71717a; font-size: 0.74rem; font-family: monospace;">${item.steamid || ''}</span>
              </div>
            </div>
          </td>
          ${extraCols}
        </tr>
      `;
    }).join('');
  }

  // Delegar fallback de imagem quebrada sem poluir o HTML
  document.addEventListener('error', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('hlb-avatar-img')) {
      const parent = e.target.parentElement;
      const initial = (e.target.getAttribute('alt') || 'H').trim().charAt(0).toUpperCase();
      e.target.remove();
      const fallback = document.createElement('span');
      fallback.className = 'hlb-avatar-fallback';
      fallback.textContent = initial || 'H';
      if (parent) parent.prepend(fallback);
    }
  }, true);

  // Inicializar eventos após DOM pronto
  function init() {
    // Abas
    document.querySelectorAll('#hlb-tabs .hlb-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#hlb-tabs .hlb-tab-btn').forEach(function(b) {
          b.style.color = '#a1a1aa';
          b.style.borderBottomColor = 'transparent';
          const icon = b.querySelector('svg');
          if (icon) icon.setAttribute('stroke', 'currentColor');
        });
        btn.style.color = '#FFFFFF';
        btn.style.borderBottomColor = '#D7573B';
        const icon = btn.querySelector('svg');
        if (icon) icon.setAttribute('stroke', '#D7573B');

        currentTab = btn.getAttribute('data-tab');
        renderHomeLeaderboard();
      });
    });

    // Busca
    const searchInput = document.getElementById('hlb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', renderHomeLeaderboard);
    }
    const searchBtn = document.getElementById('hlb-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', renderHomeLeaderboard);
    }

    // Polling imediato e contínuo
    fetchLeaderboardData();
    setInterval(fetchLeaderboardData, 45000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

