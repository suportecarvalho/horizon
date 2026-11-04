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

    container.innerHTML = items.map(item => {
      let medalSvg = '';
      let rankClass = '';
      if (item.rank === 1) {
        rankClass = 'ranking-medalha-ouro';
        medalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-ouro"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg>';
      } else if (item.rank === 2) {
        rankClass = 'ranking-medalha-prata';
        medalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-prata"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg>';
      } else if (item.rank === 3) {
        rankClass = 'ranking-medalha-bronze';
        medalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-trophy ranking-medalha ranking-medalha-bronze"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"></path><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"></path><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"></path></svg>';
      }

      let contentHtml = '';
      if (currentTab === 'pvp') {
        contentHtml = `
          <div class="ranking-cartao-destaque"><span class="ranking-cartao-destaque-valor ranking-valor-destaque">${item.kd}</span><span class="ranking-cartao-destaque-rotulo">KDR</span></div>
          <div class="grid grid-cols-2 gap-2">
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">% HS</span><span class="ranking-cartao-item-valor">${item.headshot_pct}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Kills</span><span class="ranking-cartao-item-valor" style="color:#6C978E;">${item.kills}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Mortes em PvP</span><span class="ranking-cartao-item-valor">${item.deaths}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Headshots</span><span class="ranking-cartao-item-valor">${item.headshots !== undefined ? item.headshots : 0}</span></div>
          </div>
        `;
      } else if (currentTab === 'recursos') {
        contentHtml = `
          <div class="ranking-cartao-destaque"><span class="ranking-cartao-destaque-valor ranking-valor-destaque">${formatVal(item.total)}</span><span class="ranking-cartao-destaque-rotulo">Total Recursos</span></div>
          <div class="grid grid-cols-2 gap-2">
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Pedra</span><span class="ranking-cartao-item-valor">${formatVal(item.stones || item.stone)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Enxofre</span><span class="ranking-cartao-item-valor" style="color:#f59e0b;">${formatVal(item.sulfur)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Metal</span><span class="ranking-cartao-item-valor" style="color:#60a5fa;">${formatVal(item.metal)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">HQM</span><span class="ranking-cartao-item-valor">${formatVal(item.hqm)}</span></div>
          </div>
        `;
      } else if (currentTab === 'farming') {
        contentHtml = `
          <div class="ranking-cartao-destaque"><span class="ranking-cartao-destaque-valor ranking-valor-destaque">${formatVal(item.total)}</span><span class="ranking-cartao-destaque-rotulo">Total Colhido</span></div>
          <div class="grid grid-cols-2 gap-2">
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Tecido</span><span class="ranking-cartao-item-valor">${formatVal(item.cloth)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Abóbora</span><span class="ranking-cartao-item-valor">${formatVal(item.pumpkin)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Milho</span><span class="ranking-cartao-item-valor">${formatVal(item.corn)}</span></div>
            <div class="ranking-cartao-item"><span class="ranking-cartao-item-rotulo">Batata</span><span class="ranking-cartao-item-valor">${formatVal(item.potato)}</span></div>
          </div>
        `;
      }

      const avatarSrc = cleanAvatarUrl(item.avatar);

      return `
        <div class="ranking-cartao-link">
          <div data-slot="card" class="group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10" style="background:#161312; border:1px solid rgba(108,151,142,0.22); border-radius:12px; margin-bottom:12px; padding:16px;">
            <div class="ranking-cartao-topo" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <span class="ranking-rank" style="display:inline-flex; align-items:center; gap:4px;">
                ${medalSvg}
                <span class="ranking-posicao ${rankClass}" style="font-weight:800;">#${item.rank}</span>
              </span>
              <span class="ranking-avatar-caixa"><img src="${avatarSrc}" class="ranking-avatar" alt="" style="width:36px; height:36px; border-radius:50%;" onerror="this.onerror=null;this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';"></span>
              <span class="ranking-nome-bloco">
                <span class="ranking-nome" style="color:#EDE8E5; font-weight:700; display:block;">${item.name}</span>
                <span class="ranking-id" style="color:#71717a; font-size:0.75rem;">${item.steamid}</span>
              </span>
            </div>
            <div data-slot="card-content">
              ${contentHtml}
            </div>
          </div>
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

    const filtered = list.filter(function(item) {
      if (!searchTerm) return true;
      const n = (item.name || '').toLowerCase();
      const s = (item.steamid || '').toLowerCase();
      return n.includes(searchTerm) || s.includes(searchTerm);
    });

    // Atualiza contagem
    const totalEl = document.getElementById('home-ranking-total');
    if (totalEl) {
      totalEl.innerHTML = '<strong>' + filtered.length + '</strong> jogadores sincronizados neste wipe';
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
      }
    }

    // Atualiza o corpo da tabela
    const tbody = document.getElementById('home-table-body');
    const colSpan = currentTab === 'farming' ? 14 : (currentTab === 'recursos' ? 10 : 7);

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
    fetchLeaderboardData();
    setInterval(fetchLeaderboardData, 45000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
