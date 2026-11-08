const fs = require('fs');
const path = require('path');

const files = [
  'index.html',
  'equipe/index.html',
  'loja/index.html',
  'leaderboards/index.html',
  'leaderboards/player.html',
  'noticias/index.html',
  'feed/index.html'
];

const newDesktopNav = `<nav class="horizon-header-nav" aria-label="Navegação Principal">` +
  `<a href="/" class="horizon-nav-link" data-nav="inicio">INÍCIO</a>` +
  `<a href="/loja" class="horizon-nav-link" data-nav="loja">LOJA</a>` +
  `<a href="/noticias" class="horizon-nav-link" data-nav="noticias">NOTÍCIAS</a>` +
  `<div class="horizon-nav-dropdown-wrapper">` +
    `<button type="button" class="horizon-nav-link horizon-nav-dropdown-trigger" aria-haspopup="true" aria-expanded="false" data-nav="servidores">` +
      `<span>SERVIDORES</span>` +
      `<svg class="horizon-nav-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>` +
    `</button>` +
    `<div class="horizon-nav-dropdown-menu">` +
      `<a href="/loja" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Horizon 2x Solo/Duo/Trio</span>` +
        `<span class="horizon-dropdown-desc">177.54.148.165:28015 &bull; Wipe Semanal</span>` +
      `</a>` +
      `<a href="/leaderboards" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Rankings &amp; Estatísticas</span>` +
        `<span class="horizon-dropdown-desc">Kills, PvP, Farm &amp; Raids</span>` +
      `</a>` +
      `<a href="/#servidores" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Status do Servidor</span>` +
        `<span class="horizon-dropdown-desc">Jogadores online, fila e mapa</span>` +
      `</a>` +
    `</div>` +
  `</div>` +
  `<div class="horizon-nav-dropdown-wrapper">` +
    `<button type="button" class="horizon-nav-link horizon-nav-dropdown-trigger" aria-haspopup="true" aria-expanded="false" data-nav="comunidade">` +
      `<span>COMUNIDADE</span>` +
      `<svg class="horizon-nav-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>` +
    `</button>` +
    `<div class="horizon-nav-dropdown-menu">` +
      `<a href="/equipe" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Equipe Horizon</span>` +
        `<span class="horizon-dropdown-desc">Fundadores, Devs e Moderação</span>` +
      `</a>` +
      `<a href="https://discord.gg/VTu3m2MYeX" target="_blank" rel="noreferrer noopener" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Discord Oficial</span>` +
        `<span class="horizon-dropdown-desc">Comunidade, sorteios e suporte</span>` +
      `</a>` +
      `<a href="/feed" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Feed da Comunidade</span>` +
        `<span class="horizon-dropdown-desc">Clips, novidades e eventos</span>` +
      `</a>` +
      `<a href="/regras" class="horizon-dropdown-item">` +
        `<span class="horizon-dropdown-title">Regras do Servidor</span>` +
        `<span class="horizon-dropdown-desc">Diretrizes de jogo e conduta</span>` +
      `</a>` +
    `</div>` +
  `</div>` +
`</nav>`;

files.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log('Skipping (not found):', file);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace horizon-header-nav
  const navRegex = /<nav class="horizon-header-nav"[\s\S]*?<\/nav>/;
  if (navRegex.test(content)) {
    content = content.replace(navRegex, newDesktopNav);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', file);
  } else {
    console.log('Regex not matched in:', file);
  }
});
