/**
 * Horizon Rust Leaderboard - Página Inicial
 * 100% idêntico à página /leaderboards
 */
(function() {
  let currentTab = 'pvp';
  let cachedLbData = null;
  let currentPage = 1;
  const pageSize = 10;

  function cleanAvatarUrl(url) {
    if (!url) return 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
    let clean = url.replace(/\\\//g, '/').replace(/\/\//g, '/');
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    if (clean.startsWith('http:/') && !clean.startsWith('http://')) clean = clean.replace('http:/', 'http://');
    if (clean.startsWith('https:/') && !clean.startsWith('https://')) clean = clean.replace('https:/', 'https://');
    return clean;
  }

  function formatVal(val) {
    if (val === undefined || val === null || val === "0" || val === 0) {
      return '<span style="color: #52525b; font-weight: 500;">0</span>';
    }
    return '<span style="color: #EDE8E5; font-weight: 700;">' + val + '</span>';
  }

  function renderPagination(totalPages) {
    const nav = document.getElementById('home-ranking-paginacao');
    if (!nav) return;

    if (totalPages <= 1) {
      nav.innerHTML = '<span>Página 1 de 1</span>';
      return;
    }

    let linksHtml = '';
    if (currentPage > 1) {
      linksHtml += `<a href="javascript:void(0)" onclick="window.homeLeaderboardApp.goToPage(${currentPage - 1})">Anterior</a>`;
    }
    if (currentPage < totalPages) {
      linksHtml += `<a href="javascript:void(0)" onclick="window.homeLeaderboardApp.goToPage(${currentPage + 1})">Próxima</a>`;
    }

    nav.innerHTML = `<span>Página ${currentPage} de ${totalPages}</span>${linksHtml}`;
  }

  function renderMobileCards(container, items) {
    if (items.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 30px; color: #a1a1aa;">Nenhum jogador encontrado.</div>';
      return;
    }

    function makeItemRow(iconSrc, label, val) {
      if (!label) return '<div></div>';
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${iconSrc}" alt="${label}" style="width: 18px; height: 18px; object-fit: contain;">
            <span style="color: #8E8B88; font-size: 0.82rem; font-weight: 500;">${label}</span>
          </div>
          <span style="color: #FFFFFF; font-size: 0.88rem; font-weight: 700;">${formatVal(val)}</span>
        </div>
      `;
    }

    container.innerHTML = items.map(item => {
      let trophySvg = '';
      if (item.rank === 1) {
        trophySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
      } else if (item.rank === 2) {
        trophySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#CBD5E1" stroke="#CBD5E1" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
      } else if (item.rank === 3) {
        trophySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#D97706" stroke="#D97706" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
      }

      let highlightHtml = '';
      let gridHtml = '';

      if (currentTab === 'pvp') {
        highlightHtml = `
          <div style="margin-top: 14px; margin-bottom: 12px; display: flex; align-items: baseline; gap: 8px;">
            <span style="font-size: 1.75rem; font-weight: 800; color: #D7573B; line-height: 1;">${item.kd}</span>
            <span style="font-size: 0.82rem; font-weight: 700; color: #71717A; text-transform: uppercase;">KDR</span>
          </div>
        `;
        gridHtml = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
              <span style="color: #8E8B88; font-size: 0.82rem; font-weight: 600;">% HS</span>
              <span style="color: #FFFFFF; font-size: 0.88rem; font-weight: 700;">${item.headshot_pct}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
              <span style="color: #8E8B88; font-size: 0.82rem; font-weight: 600;">Kills</span>
              <span style="color: #FFFFFF; font-size: 0.88rem; font-weight: 700;">${item.kills}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
              <span style="color: #8E8B88; font-size: 0.82rem; font-weight: 600;">Mortes em PvP</span>
              <span style="color: #FFFFFF; font-size: 0.88rem; font-weight: 700;">${item.deaths}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
              <span style="color: #8E8B88; font-size: 0.82rem; font-weight: 600;">Headshots</span>
              <span style="color: #FFFFFF; font-size: 0.88rem; font-weight: 700;">${item.headshots !== undefined ? item.headshots : 0}</span>
            </div>
          </div>
        `;
      } else if (currentTab === 'recursos') {
        highlightHtml = `
          <div style="margin-top: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="/images/items/stones.png" alt="Pedra" style="width: 22px; height: 22px; object-fit: contain;">
              <span style="font-size: 1.05rem; font-weight: 700; color: #EDE8E5;">Pedra</span>
            </div>
            <span style="font-size: 1.75rem; font-weight: 800; color: #FFFFFF; line-height: 1;">${formatVal(item.stones || item.stone || 0)}</span>
          </div>
        `;
        const recursoRows = [
          [ { icon: '/images/items/sulfur.ore.png', label: 'Enxofre', val: item.sulfur }, { icon: '/images/items/metal.ore.png', label: 'Metal', val: item.metal } ],
          [ { icon: '/images/items/hq.metal.ore.png', label: 'HQM', val: item.hqm }, { icon: '/images/items/wood.png', label: 'Madeira', val: item.wood } ],
          [ { icon: '/images/items/leather.png', label: 'Couro', val: item.leather }, { icon: '/images/items/fat.animal.png', label: 'Gordura', val: item.fat } ],
          [ { icon: '/images/items/bone.fragments.png', label: 'Ossos', val: item.bone }, null ]
        ];
        gridHtml = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 8px;">
            ${recursoRows.map(pair => `
              ${makeItemRow(pair[0].icon, pair[0].label, pair[0].val)}
              ${pair[1] ? makeItemRow(pair[1].icon, pair[1].label, pair[1].val) : '<div></div>'}
            `).join('')}
          </div>
        `;
      } else if (currentTab === 'farming') {
        highlightHtml = `
          <div style="margin-top: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="/images/items/cloth.png" alt="Pano" style="width: 22px; height: 22px; object-fit: contain;">
              <span style="font-size: 1.05rem; font-weight: 700; color: #EDE8E5;">Pano</span>
            </div>
            <span style="font-size: 1.75rem; font-weight: 800; color: #FFFFFF; line-height: 1;">${formatVal(item.cloth || 0)}</span>
          </div>
        `;
        const farmingRows = [
          [ { icon: '/images/items/yellow.berry.png', label: 'Amarela', val: item.yellow_berry }, { icon: '/images/items/red.berry.png', label: 'Vermelha', val: item.red_berry } ],
          [ { icon: '/images/items/blue.berry.png', label: 'Azul', val: item.blue_berry }, { icon: '/images/items/green.berry.png', label: 'Verde', val: item.green_berry } ],
          [ { icon: '/images/items/white.berry.png', label: 'Branca', val: item.white_berry }, { icon: '/images/items/mushroom.png', label: 'Cogumelo', val: item.mushroom } ],
          [ { icon: '/images/items/pumpkin.png', label: 'Abóbora', val: item.pumpkin }, { icon: '/images/items/corn.png', label: 'Milho', val: item.corn } ],
          [ { icon: '/images/items/potato.png', label: 'Batata', val: item.potato }, { icon: '/images/items/wheat.png', label: 'Trigo', val: item.wheat } ],
          [ { icon: '/images/items/egg.png', label: 'Ovo', val: item.egg }, null ]
        ];
        gridHtml = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 8px;">
            ${farmingRows.map(pair => `
              ${makeItemRow(pair[0].icon, pair[0].label, pair[0].val)}
              ${pair[1] ? makeItemRow(pair[1].icon, pair[1].label, pair[1].val) : '<div></div>'}
            `).join('')}
          </div>
        `;
      } else if (currentTab === 'raid') {
        highlightHtml = `
          <div style="margin-top: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; background: rgba(239, 68, 68, 0.15); color: #EF4444;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="13" r="9"></circle><path d="m19.5 9.5 1.8-1.8a2.4 2.4 0 0 0 0-3.4l-1.6-1.6a2.4 2.4 0 0 0-3.4 0l-1.8 1.8"></path><path d="m17 7-2 2"></path></svg>
              </span>
              <span style="font-size: 1.05rem; font-weight: 700; color: #EDE8E5;">Score de Raid</span>
            </div>
            <span style="font-size: 1.75rem; font-weight: 800; color: #EF4444; line-height: 1;">${formatVal(item.total_score || 0)}</span>
          </div>
        `;
        const raidRows = [
          [ { icon: '/images/items/ammo.rocket.basic.png', label: 'Foguetes', val: item.rockets }, { icon: '/images/items/explosive.timed.png', label: 'C4', val: item.c4 } ],
          [ { icon: '/images/items/explosive.satchel.png', label: 'Satchels', val: item.satchels }, { icon: '/images/items/door.hinged.metal.png', label: 'Portas', val: item.doors } ],
          [ { icon: '/images/items/wall.external.high.stone.png', label: 'Estruturas', val: item.structures }, null ]
        ];
        gridHtml = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; row-gap: 8px;">
            ${raidRows.map(pair => `
              ${makeItemRow(pair[0].icon, pair[0].label, pair[0].val)}
              ${pair[1] ? makeItemRow(pair[1].icon, pair[1].label, pair[1].val) : '<div></div>'}
            `).join('')}
          </div>
        `;
      }

      const avatarSrc = cleanAvatarUrl(item.avatar);
      const initial = (item.name || '?').trim().charAt(0).toUpperCase();

      return `
        <div class="ranking-cartao-link" style="margin-bottom: 12px;">
          <div style="background: #141211; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="display: flex; align-items: center;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 50px;">
                ${trophySvg}
                <span style="font-size: 1.15rem; font-weight: 800; color: ${item.rank <= 3 ? '#FFFFFF' : '#A1A1AA'};">#${item.rank}</span>
              </div>
              <div style="width: 44px; height: 44px; min-width: 44px; border-radius: 50%; border: 2px solid #D7573B; display: flex; align-items: center; justify-content: center; background: #22201E; overflow: hidden; margin: 0 12px 0 8px; flex-shrink: 0;">
                ${avatarSrc && !avatarSrc.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb') ? `
                  <img src="${avatarSrc}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.15);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                  <span style="display: none; font-size: 1.2rem; font-weight: 700; color: #D4D4D8;">${initial}</span>
                ` : `
                  <span style="font-size: 1.2rem; font-weight: 700; color: #D4D4D8;">${initial}</span>
                `}
              </div>
              <div style="overflow: hidden; flex: 1;">
                <div style="color: #FFFFFF; font-weight: 800; font-size: 1.05rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                <div style="color: #71717A; font-size: 0.78rem; margin-top: 3px; font-family: monospace;">${item.steamid}</div>
              </div>
            </div>
            
            ${highlightHtml}
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 12px;"></div>
            ${gridHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPodiumCards(container, list) {
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = '';
      return;
    }

    const top3 = list.slice(0, 3);
    if (top3.length === 0) {
      container.innerHTML = '';
      return;
    }

    const categoryNames = {
      pvp: 'PVP',
      recursos: 'Recursos',
      farming: 'Farming',
      raid: 'Raid'
    };

    const trophySvgs = {
      1: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
      2: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#CBD5E1" stroke="#CBD5E1" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
      3: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#D97706" stroke="#D97706" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>'
    };

    const badgeClasses = {
      1: 'podium-badge-gold',
      2: 'podium-badge-silver',
      3: 'podium-badge-bronze'
    };

    container.innerHTML = top3.map(function(item, idx) {
      const rankNum = idx + 1; // 1, 2, 3
      const avatarSrc = cleanAvatarUrl(item.avatar);
      const trophySvg = trophySvgs[rankNum] || '';
      const badgeCls = badgeClasses[rankNum] || 'podium-badge-gold';

      let primaryStatHtml = '';
      let substatsHtml = '';

      if (currentTab === 'pvp') {
        primaryStatHtml = `
          <div class="podium-primary-stat">
            <span class="podium-stat-label">KDR Geral</span>
            <span class="podium-stat-val">${item.kd || '0.00'}</span>
          </div>
        `;
        substatsHtml = `
          <div class="podium-substats-grid">
            <div class="podium-substat-item">
              <span class="podium-substat-name">Kills</span>
              <span class="podium-substat-val" style="color: #6C978E;">${item.kills || 0}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name">% HS</span>
              <span class="podium-substat-val">${item.headshot_pct || '0%'}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name">Mortes</span>
              <span class="podium-substat-val">${item.deaths || 0}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name">Headshots</span>
              <span class="podium-substat-val">${item.headshots !== undefined ? item.headshots : 0}</span>
            </div>
          </div>
        `;
      } else if (currentTab === 'recursos') {
        primaryStatHtml = `
          <div class="podium-primary-stat">
            <span class="podium-stat-label">Total Coletado</span>
            <span class="podium-stat-val">${item.total || '0'}</span>
          </div>
        `;
        substatsHtml = `
          <div class="podium-substats-grid">
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/stones.png" alt="Pedra"> Pedra</span>
              <span class="podium-substat-val">${formatVal(item.stones || item.stone)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/sulfur.ore.png" alt="Enxofre"> Enxofre</span>
              <span class="podium-substat-val">${formatVal(item.sulfur)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/metal.ore.png" alt="Metal"> Metal</span>
              <span class="podium-substat-val">${formatVal(item.metal)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/wood.png" alt="Madeira"> Madeira</span>
              <span class="podium-substat-val">${formatVal(item.wood)}</span>
            </div>
          </div>
        `;
      } else if (currentTab === 'farming') {
        primaryStatHtml = `
          <div class="podium-primary-stat">
            <span class="podium-stat-label">Total Colhido</span>
            <span class="podium-stat-val">${item.total || '0'}</span>
          </div>
        `;
        substatsHtml = `
          <div class="podium-substats-grid">
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/cloth.png" alt="Tecido"> Tecido</span>
              <span class="podium-substat-val">${formatVal(item.cloth)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/pumpkin.png" alt="Abóbora"> Abóbora</span>
              <span class="podium-substat-val">${formatVal(item.pumpkin)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/mushroom.png" alt="Cogumelo"> Cogumelo</span>
              <span class="podium-substat-val">${formatVal(item.mushroom)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/corn.png" alt="Milho"> Milho</span>
              <span class="podium-substat-val">${formatVal(item.corn)}</span>
            </div>
          </div>
        `;
      } else if (currentTab === 'raid') {
        primaryStatHtml = `
          <div class="podium-primary-stat">
            <span class="podium-stat-label">Score de Raid</span>
            <span class="podium-stat-val" style="color: #EF4444;">${item.total_score || '0'}</span>
          </div>
        `;
        substatsHtml = `
          <div class="podium-substats-grid">
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/ammo.rocket.basic.png" alt="Foguetes"> Foguetes</span>
              <span class="podium-substat-val">${formatVal(item.rockets)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/explosive.timed.png" alt="C4"> C4</span>
              <span class="podium-substat-val">${formatVal(item.c4)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/explosive.satchel.png" alt="Satchels"> Satchels</span>
              <span class="podium-substat-val">${formatVal(item.satchels)}</span>
            </div>
            <div class="podium-substat-item">
              <span class="podium-substat-name"><img src="/images/items/door.hinged.metal.png" alt="Portas"> Portas</span>
              <span class="podium-substat-val">${formatVal(item.doors)}</span>
            </div>
            <div class="podium-substat-item" style="grid-column: span 2;">
              <span class="podium-substat-name"><img src="/images/items/wall.external.high.stone.png" alt="Estruturas"> Paredes / Estruturas</span>
              <span class="podium-substat-val">${formatVal(item.structures)}</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="podium-card podium-card-rank-${rankNum}">
          <div class="podium-header-row">
            <span class="podium-top-badge ${badgeCls}">
              ${trophySvg}
              ${rankNum}º Lugar
            </span>
            <span class="podium-category-tag">${categoryNames[currentTab] || 'Ranking'}</span>
          </div>

          <div class="podium-player-header">
            <div class="podium-avatar-wrap">
              <img src="${avatarSrc}" alt="${item.name}" class="podium-avatar-img" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';">
              <span class="podium-avatar-num">${rankNum}</span>
            </div>
            <div class="podium-player-info">
              <a href="/leaderboards/${item.steamid}" class="podium-player-name" title="${item.name}">${item.name}</a>
              <span class="podium-player-steamid">${item.steamid}</span>
            </div>
          </div>

          <div class="podium-stats-box">
            ${primaryStatHtml}
            ${substatsHtml}
          </div>

          <a href="/leaderboards/${item.steamid}" class="podium-link-btn">
            Ver Estatísticas
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </a>
        </div>
      `;
    }).join('');
  }

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

  function renderHomeLeaderboard() {
    if (!cachedLbData) return;

    const searchInput = document.getElementById('home-leaderboard-search');
    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const list = cachedLbData[currentTab] || [];

    // Renderiza sempre os 3 cards do topo da categoria ativa
    const podiumContainer = document.getElementById('home-podium-cards');
    if (podiumContainer) {
      renderPodiumCards(podiumContainer, list);
    }

    const filtered = list.filter(function(item) {
      if (!searchTerm) return true;
      const n = (item.name || '').toLowerCase();
      const s = (item.steamid || '').toLowerCase();
      return n.includes(searchTerm) || s.includes(searchTerm);
    });

    // Atualiza contagem
    const totalEl = document.getElementById('home-ranking-total');
    if (totalEl) {
      totalEl.innerHTML = '<strong>' + filtered.length + '</strong> jogadores neste wipe';
    }

    // Calcula paginação (máximo de 10 por página)
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + pageSize);

    // Atualiza classe da tabela para layout específico por aba
    const table = document.getElementById('home-main-table');
    if (table) {
      table.className = `w-full caption-bottom text-sm ranking-tabela ranking-tabela-${currentTab}`;
    }

    // Atualiza cabeçalho da tabela
    const thead = document.getElementById('home-table-head');
    if (thead) {
      if (currentTab === 'pvp') {
        thead.innerHTML = `
          <tr class="ranking-cabecalho">
            <th class="ranking-cab ranking-cab-rank" style="width: 85px; text-align: center;">#</th>
            <th class="ranking-cab ranking-cab-jogador" style="text-align: left; padding-left: 24px;">JOGADOR</th>
            <th class="ranking-cab" style="text-align: center;">KDR</th>
            <th class="ranking-cab" style="text-align: center;">% HS</th>
            <th class="ranking-cab" style="text-align: center;">KILLS</th>
            <th class="ranking-cab" style="text-align: center;">MORTES EM PVP</th>
            <th class="ranking-cab" style="text-align: center;">HEADSHOTS</th>
          </tr>
        `;
      } else if (currentTab === 'recursos') {
        thead.innerHTML = `
          <tr class="ranking-cabecalho">
            <th class="ranking-cab ranking-cab-rank" style="width: 75px; text-align: center;">#</th>
            <th class="ranking-cab ranking-cab-jogador" style="width: 28%; text-align: left; padding-left: 20px;">JOGADOR</th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Pedra"><img src="/images/items/stones.png" alt="Pedra" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Minério de Enxofre"><img src="/images/items/sulfur.ore.png" alt="Enxofre" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Minério de Metal"><img src="/images/items/metal.ore.png" alt="Metal" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="HQM (Metal de Alta Qualidade)"><img src="/images/items/hq.metal.ore.png" alt="HQM" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Madeira"><img src="/images/items/wood.png" alt="Madeira" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Couro"><img src="/images/items/leather.png" alt="Couro" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Gordura Animal"><img src="/images/items/fat.animal.png" alt="Gordura Animal" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 9%; text-align: center;" title="Fragmentos de Osso"><img src="/images/items/bone.fragments.png" alt="Ossos" class="hlb-item-icon"></th>
          </tr>
        `;
      } else if (currentTab === 'farming') {
        thead.innerHTML = `
          <tr class="ranking-cabecalho">
            <th class="ranking-cab ranking-cab-rank" style="width: 65px; text-align: center;">#</th>
            <th class="ranking-cab ranking-cab-jogador" style="width: 24%; text-align: left; padding-left: 16px;">JOGADOR</th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Tecido (Cloth)"><img src="/images/items/cloth.png" alt="Tecido" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Amora Amarela"><img src="/images/items/yellow.berry.png" alt="Amora Amarela" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Amora Vermelha"><img src="/images/items/red.berry.png" alt="Amora Vermelha" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Amora Azul"><img src="/images/items/blue.berry.png" alt="Amora Azul" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Amora Verde"><img src="/images/items/green.berry.png" alt="Amora Verde" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Amora Branca"><img src="/images/items/white.berry.png" alt="Amora Branca" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Cogumelo"><img src="/images/items/mushroom.png" alt="Cogumelo" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Abóbora"><img src="/images/items/pumpkin.png" alt="Abóbora" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Milho"><img src="/images/items/corn.png" alt="Milho" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Batata"><img src="/images/items/potato.png" alt="Batata" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Trigo"><img src="/images/items/wheat.png" alt="Trigo" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 6.33%; text-align: center;" title="Ovo"><img src="/images/items/egg.png" alt="Ovo" class="hlb-item-icon"></th>
          </tr>
        `;
      } else if (currentTab === 'raid') {
        thead.innerHTML = `
          <tr class="ranking-cabecalho">
            <th class="ranking-cab ranking-cab-rank" style="width: 75px; text-align: center;">#</th>
            <th class="ranking-cab ranking-cab-jogador" style="width: 28%; text-align: left; padding-left: 20px;">JOGADOR</th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="Score Total de Raid">SCORE</th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="Foguetes Disparados"><img src="/images/items/ammo.rocket.basic.png" alt="Foguetes" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="C4 Detonados"><img src="/images/items/explosive.timed.png" alt="C4" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="Satchels Lançados"><img src="/images/items/explosive.satchel.png" alt="Satchels" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="Paredes e Fundações Destruídas"><img src="/images/items/wall.external.high.stone.png" alt="Estruturas" class="hlb-item-icon"></th>
            <th class="ranking-cab" style="width: 12%; text-align: center;" title="Portas Destruídas"><img src="/images/items/door.hinged.metal.png" alt="Portas" class="hlb-item-icon"></th>
          </tr>
        `;
      }
    }

    // Atualiza o corpo da tabela
    const tbody = document.getElementById('home-table-body');
    const colSpan = currentTab === 'farming' ? 14 : (currentTab === 'recursos' ? 10 : (currentTab === 'raid' ? 8 : 7));

    if (filtered.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="' + colSpan + '" style="text-align: center; padding: 40px; color: #a1a1aa; font-weight: 600;">Nenhum jogador encontrado com esses critérios.</td></tr>';
      const cardsContainer = document.getElementById('home-ranking-cartoes');
      if (cardsContainer) renderMobileCards(cardsContainer, []);
      renderPagination(0);
      return;
    }

    if (tbody) {
      tbody.innerHTML = pageItems.map(function(item) {
        let medalHtml = '<span class="ranking-posicao">' + item.rank + '</span>';
        if (item.rank === 1) {
          medalHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-ouro"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg><span class="ranking-posicao ranking-medalha-ouro">1</span>';
        } else if (item.rank === 2) {
          medalHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-prata"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg><span class="ranking-posicao ranking-medalha-prata">2</span>';
        } else if (item.rank === 3) {
          medalHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-bronze"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg><span class="ranking-posicao ranking-medalha-bronze">3</span>';
        }

        let extraCols = '';
        if (currentTab === 'pvp') {
          extraCols = `
            <td class="ranking-valor ranking-valor-destaque" style="color: #D7573B; font-weight: bold; text-align: center;">${item.kd}</td>
            <td class="ranking-valor" style="text-align: center;">${item.headshot_pct}</td>
            <td class="ranking-valor" style="color: #6C978E; font-weight: 700; text-align: center;">${item.kills}</td>
            <td class="ranking-valor" style="text-align: center;">${item.deaths}</td>
            <td class="ranking-valor" style="text-align: center;">${item.headshots !== undefined ? item.headshots : 0}</td>
          `;
        } else if (currentTab === 'recursos') {
          extraCols = `
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.stones || item.stone)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.sulfur)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.metal)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.hqm)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.wood)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.leather)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.fat)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.bone)}</td>
          `;
        } else if (currentTab === 'farming') {
          extraCols = `
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.cloth)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.yellow_berry)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.red_berry)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.blue_berry)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.green_berry)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.white_berry)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.mushroom)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.pumpkin)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.corn)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.potato)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.wheat)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.egg)}</td>
          `;
        } else if (currentTab === 'raid') {
          extraCols = `
            <td class="ranking-valor ranking-valor-destaque" style="color: #EF4444; font-weight: 800; text-align: center;">${formatVal(item.total_score || 0)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.rockets)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.c4)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.satchels)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.structures)}</td>
            <td class="ranking-valor" style="text-align: center;">${formatVal(item.doors)}</td>
          `;
        }

        const avatarSrc = cleanAvatarUrl(item.avatar);

        return `
          <tr class="ranking-linha">
            <td class="ranking-celula-rank"><span class="ranking-rank">${medalHtml}</span></td>
            <td class="ranking-celula-jogador">
              <a href="/leaderboards/${item.steamid}" class="ranking-jogador" style="text-decoration: none; gap: 16px;">
                <span class="ranking-avatar-caixa"><img src="${avatarSrc}" class="ranking-avatar" alt="" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';"></span>
                <span class="ranking-nome-bloco">
                  <span class="ranking-nome" style="color: #EDE8E5; font-weight: 600;">${item.name}</span>
                  <span class="ranking-id">${item.steamid}</span>
                </span>
              </a>
            </td>
            ${extraCols}
          </tr>
        `;
      }).join('');
    }

    // Atualiza os cartões mobile
    const cardsContainer = document.getElementById('home-ranking-cartoes');
    if (cardsContainer) {
      renderMobileCards(cardsContainer, pageItems);
    }

    // Atualiza a paginação
    renderPagination(totalPages);
  }

  // Objeto global para ações de paginação
  window.homeLeaderboardApp = {
    goToPage: function(page) {
      currentPage = page;
      renderHomeLeaderboard();
      const topTarget = document.getElementById('ranking');
      if (topTarget) {
        topTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  function init() {
    // Event listeners para as abas
    document.querySelectorAll('#home-leaderboard-tabs button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#home-leaderboard-tabs button').forEach(function(b) {
          b.classList.remove('ranking-aba-atual');
        });
        btn.classList.add('ranking-aba-atual');
        currentTab = btn.getAttribute('data-tab');
        currentPage = 1;
        renderHomeLeaderboard();
      });
    });

    // Event listener para a busca
    const searchInput = document.getElementById('home-leaderboard-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        currentPage = 1;
        renderHomeLeaderboard();
      });
    }

    // Inicialização dos dados
    if (window.location.hash === '#recursos' || window.location.search.includes('tab=recursos')) {
      currentTab = 'recursos';
    } else if (window.location.hash === '#farming' || window.location.search.includes('tab=farming')) {
      currentTab = 'farming';
    } else if (window.location.hash === '#raid' || window.location.search.includes('tab=raid')) {
      currentTab = 'raid';
    }

    if (window.location.hash.includes('ranking') || window.location.search.includes('tab=')) {
      setTimeout(function() {
        const topTarget = document.getElementById('ranking');
        if (topTarget) {
          topTarget.scrollIntoView();
        }
      }, 300);
    }

    document.querySelectorAll('#home-leaderboard-tabs button').forEach(function(b) {
      if (b.getAttribute('data-tab') === currentTab) {
        b.classList.add('ranking-aba-atual');
      } else {
        b.classList.remove('ranking-aba-atual');
      }
    });

    fetchLeaderboardData();
    setInterval(fetchLeaderboardData, 45000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
