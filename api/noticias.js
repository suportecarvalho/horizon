const https = require('https');

const TRANSLATIONS = [
  {
    match: /printed (and|&) polished/i,
    title: 'Impresso e Polido (Printed and Polished)',
    desc: 'A atualização deste mês traz a reformulação dos Blueprints, a nova submetralhadora Uzi 9mm, grandes focos de otimização de desempenho, além de várias correções e melhorias de qualidade de vida!'
  },
  {
    match: /halloween/i,
    title: 'Halloween 2026',
    desc: 'A escuridão cai sobre a ilha enquanto monstros despertam de seu sono. Fendas se abrem em locais aleatórios, levando para o desconhecido. Entre se tiver coragem, mas se entrar, é melhor se preparar!'
  },
  {
    match: /livestock/i,
    title: 'Atualização de Pecuária (Livestock)',
    desc: 'A atualização deste mês traz uma grande reformulação para a agricultura e fazendas com novos animais de criação, criaturas e nadadores. Além de receitas de comida fresca, o novo Gerador de Biocombustível, reformulação nas barricadas e novas salas de loot!'
  },
  {
    match: /breach and clear/i,
    title: 'Invadir e Limpar (Breach and Clear)',
    desc: 'A atualização deste mês traz Bloqueadores de Monumentos, Blindagem Destrutível para o Helicóptero de Ataque, Nós de HQM, Balanceamento de Manutenção em Grupo, buffs de itens e melhorias de qualidade de vida!'
  },
  {
    match: /power trip/i,
    title: 'Jornada Elétrica (Power Trip)',
    desc: 'A atualização deste mês introduz monumentos mantidos por jogadores, com a nova Queda de Satélite, Bombeamento na Cúpula (Dome), Usina de Energia restaurável e muito mais!'
  },
  {
    match: /common ground/i,
    title: 'Ponto de Encontro (Common Ground)',
    desc: 'A atualização deste mês apresenta um novo monumento: o Complexo de Apartamentos, Lojas para Alugar, novo Sistema de Clãs com Mesa de Clã, além de melhorias de qualidade de vida e muito mais!'
  },
  {
    match: /built different/i,
    title: 'Construído Diferente (Built Different)',
    desc: 'A atualização traz a maior reformulação dos personagens do Rust em anos, com novos modelos e animações de jogadores, um novo conjunto de armadura e o rifle M16A2!'
  },
  {
    match: /upgrade hard,? raid harder/i,
    title: 'Evolua Forte, Raideie Mais Forte',
    desc: 'A atualização deste mês traz melhorias para as Bancadas de Trabalho (Workbench), o novo Morteiro, Alarme de Lata aprimorado, além de novos modelos e visuais refeitos!'
  },
  {
    match: /spring clean/i,
    title: 'Limpeza de Primavera (Spring Clean)',
    desc: 'A atualização traz DOIS novos itens — o Alçapão Blindado com Escada e a Roda D\'água —, além de inúmeras melhorias de desempenho, correções de bugs e otimizações!'
  },
  {
    match: /shipshape/i,
    title: 'Em Plena Forma no Mar (Shipshape)',
    desc: 'A atualização traz grandes melhorias na forma como você vive, constrói e combate na água e no Mar Profundo. Além de dias mais longos no jogo, balanceamentos e correções.'
  },
  {
    match: /lunar new year/i,
    title: 'Ano Novo Lunar 2026',
    desc: 'As celebrações do Ano Novo Lunar de 2026 começaram! Celebre o Ano do Cavalo com a Máscara Ornamental de Cavalo, Armadura de Cavalo e itens comemorativos exclusivos.'
  },
  {
    match: /naval/i,
    title: 'Atualização Naval',
    desc: 'Ahoy marujo! Este mês trazemos barcos construíveis, mar profundo, ilhas tropicais, navios fantasmas, inteligência artificial aprimorada e muito, muito mais!'
  },
  {
    match: /community update/i,
    title: 'Atualização da Comunidade',
    desc: 'Novidades da fase de testes navais (Staging), Twitch Drops, retrospectiva do Rustmas, C4 sorrateiro e criações exclusivas da comunidade!'
  }
];

function translateTitleAndDesc(rawTitle, rawDesc) {
  for (const t of TRANSLATIONS) {
    if (t.match.test(rawTitle) || (rawDesc && t.match.test(rawDesc))) {
      return { title: t.title, desc: t.desc };
    }
  }

  // Tradução heurística de termos comuns da Facepunch caso saia uma notícia inédita no RSS
  let tTitle = rawTitle
    .replace(/\bUpdate\b/gi, 'Atualização')
    .replace(/\bCommunity Update\b/gi, 'Atualização da Comunidade')
    .replace(/\bDevblog\b/gi, 'Blog dos Desenvolvedores')
    .replace(/\bPatch Notes\b/gi, 'Notas de Atualização');

  let tDesc = rawDesc
    .replace(/This month's update brings you/gi, 'A atualização deste mês traz')
    .replace(/This month's update brings/gi, 'A atualização deste mês traz')
    .replace(/This month's update features/gi, 'A atualização deste mês apresenta')
    .replace(/This update brings/gi, 'Esta atualização traz')
    .replace(/and much more/gi, 'e muito mais')
    .replace(/bug fixes/gi, 'correções de bugs')
    .replace(/performance improvements/gi, 'melhorias de desempenho')
    .replace(/QoL improvements/gi, 'melhorias de qualidade de vida')
    .replace(/quality of life/gi, 'qualidade de vida');

  return { title: tTitle, desc: tDesc };
}

let newsCache = {
  data: [
    {
      title: 'Impresso e Polido (Printed and Polished)',
      link: 'https://rust.facepunch.com/news/printed_and_polished/',
      date: '5 de novembro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/November/pp_blog_hero.jpg',
      description: 'A atualização deste mês traz a reformulação dos Blueprints, a nova submetralhadora Uzi 9mm, grandes focos de otimização de desempenho, além de várias correções e melhorias de qualidade de vida!'
    },
    {
      title: 'Halloween 2026',
      link: 'https://rust.facepunch.com/news/halloween-2026/',
      date: '22 de outubro de 2026',
      image: 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg',
      description: 'A escuridão cai sobre a ilha enquanto monstros despertam de seu sono. Fendas se abrem em locais aleatórios, levando para o desconhecido. Entre se tiver coragem!'
    },
    {
      title: 'Atualização de Pecuária (Livestock)',
      link: 'https://rust.facepunch.com/news/livestock/',
      date: '1 de outubro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/September/livestock_blog.jpg',
      description: 'A atualização deste mês traz uma grande reformulação para a agricultura e fazendas com novos animais de criação, criaturas e nadadores. Além de receitas de comida fresca.'
    },
    {
      title: 'Invadir e Limpar (Breach and Clear)',
      link: 'https://rust.facepunch.com/news/breach-and-clear/',
      date: '3 de setembro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/Skinkbreach-and-clear_media.jpg',
      description: 'A atualização traz Bloqueadores de Monumentos, Blindagem Destrutível para o Helicóptero de Ataque, Nós de HQM, Balanceamento de Manutenção em Grupo e melhorias de qualidade de vida.'
    },
    {
      title: 'Jornada Elétrica (Power Trip)',
      link: 'https://rust.facepunch.com/news/power-trip/',
      date: '6 de agosto de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/pt_hero.jpg',
      description: 'A atualização introduz monumentos mantidos por jogadores, com a nova Queda de Satélite, Bombeamento na Cúpula (Dome), energia restaurável e muito mais.'
    },
    {
      title: 'Ponto de Encontro (Common Ground)',
      link: 'https://rust.facepunch.com/news/common-ground/',
      date: '2 de julho de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg',
      description: 'Apresenta um novo monumento: o Complexo de Apartamentos, Lojas para Alugar, novo Sistema de Clãs com Mesa de Clã e diversas melhorias de qualidade de vida!'
    },
    {
      title: 'Construído Diferente (Built Different)',
      link: 'https://rust.facepunch.com/news/built-different/',
      date: '4 de junho de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/Rust%20x%20Built%20Different%20Hero%20-%20Alternative.jpg',
      description: 'A maior reformulação dos personagens do Rust em anos, com novos modelos e animações de jogadores, um novo conjunto de armadura e o rifle M16A2!'
    },
    {
      title: 'Evolua Forte, Raideie Mais Forte',
      link: 'https://rust.facepunch.com/news/upgrade-hard-raid-harder/',
      date: '7 de maio de 2026',
      image: 'https://files.facepunch.com/lewis/1b0111b1/raid-harder.jpg',
      description: 'Traz melhorias para as Bancadas de Trabalho (Workbench), o novo Morteiro, Alarme de Lata aprimorado, além de novos modelos e visuais refeitos!'
    },
    {
      title: 'Limpeza de Primavera (Spring Clean)',
      link: 'https://rust.facepunch.com/news/spring-clean/',
      date: '2 de abril de 2026',
      image: 'https://files.facepunch.com/Flavien/spring_clean-blogheader.jpg',
      description: 'Traz dois novos itens — o Alçapão Blindado com Escada e a Roda D\'água —, além de inúmeras melhorias de desempenho, correções de bugs e otimizações!'
    },
    {
      title: 'Em Plena Forma no Mar (Shipshape)',
      link: 'https://rust.facepunch.com/news/shipshape/',
      date: '5 de março de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/rust_shipshape_hero.jpg',
      description: 'Grandes melhorias na forma como você vive, constrói e combate na água e no Mar Profundo, além de dias mais longos no jogo, balanceamentos e correções.'
    },
    {
      title: 'Ano Novo Lunar 2026',
      link: 'https://rust.facepunch.com/news/lunar-new-year-2026/',
      date: '17 de fevereiro de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/lny_blog_hero.jpg',
      description: 'Celebre o Ano do Cavalo com a Máscara Ornamental de Cavalo, Armadura de Cavalo e itens comemorativos exclusivos.'
    }
  ],
  lastFetch: 0
};

function formatPtBrDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function fetchFacepunchNews() {
  const now = Date.now();
  if (now - newsCache.lastFetch < 900000 && newsCache.data && newsCache.data.length >= 8) {
    return Promise.resolve(newsCache.data);
  }

  return new Promise((resolve) => {
    https.get('https://rust.facepunch.com/rss/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 6000
    }, (res) => {
      if (res.statusCode !== 200) return resolve(newsCache.data);
      let b = '';
      res.on('data', chunk => { b += chunk; });
      res.on('end', () => {
        try {
          const items = b.match(/<item>[\s\S]*?<\/item>/g) || [];
          if (items.length === 0) return resolve(newsCache.data);

          const parsed = [];
          for (let i = 0; i < Math.min(items.length, 12); i++) {
            const it = items[i];
            const rawTitle = (it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
            const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
            const pubDate = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
            const unescaped = it
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&');

            let img = (unescaped.match(/src="([^"]+\.(?:jpg|png|jpeg|webp))"/i) || [])[1] || '';
            if (!img && rawTitle.toLowerCase().includes('halloween')) {
              img = 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg';
            }
            if (!img) {
              img = 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg';
            }

            const descMatch = unescaped.match(/<description>([\s\S]*?)<\/description>/);
            let rawDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (rawDesc.length > 250) rawDesc = rawDesc.slice(0, 247) + '...';

            // Traduzir título e descrição para português
            const { title, desc } = translateTitleAndDesc(rawTitle, rawDesc);

            parsed.push({
              title,
              link,
              date: formatPtBrDate(pubDate),
              image: img,
              description: desc
            });
          }

          if (parsed.length >= 4) {
            newsCache = { data: parsed, lastFetch: Date.now() };
            return resolve(parsed);
          }
        } catch (e) {}
        resolve(newsCache.data);
      });
    }).on('error', () => resolve(newsCache.data))
      .on('timeout', () => resolve(newsCache.data));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const news = await fetchFacepunchNews();
  return res.status(200).json(news);
};
