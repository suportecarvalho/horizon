const crypto = require('crypto');
// -------------------------------------------------------------
// UTILITÁRIO: Busca avatar real do Steam via miniprofile (sem API Key)
// -------------------------------------------------------------
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { exec } = require('child_process');

// Cache de avatares em memória: steamId → avatarUrl
const avatarCache = {};
const DEFAULT_AVATAR = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

function fetchSteamAvatar(steamId64) {
  if (avatarCache[steamId64]) return Promise.resolve(avatarCache[steamId64]);

  const accountId = (BigInt(steamId64) - 76561197960265728n).toString();
  const url = `https://steamcommunity.com/miniprofile/${accountId}/json/`;

  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const m = body.match(/"avatar_url"\s*:\s*"([^"]+)"/);
          if (m && m[1] && m[1].startsWith('http') && !m[1].includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb')) {
            avatarCache[steamId64] = m[1];
            resolve(m[1]);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// Enriquece um array de jogadores com avatares reais do Steam
async function enrichAvatars(players) {
  if (!players || players.length === 0) return players;

  // Filtra apenas os que precisam de avatar
  const sem = players.filter(p => {
    const av = p.avatar || '';
    return !av || av.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb') || av === DEFAULT_AVATAR;
  });

  if (sem.length === 0) return players;

  // Busca em paralelo (máx. 5 simultâneos para não sobrecarregar)
  const BATCH = 5;
  for (let i = 0; i < sem.length; i += BATCH) {
    const batch = sem.slice(i, i + BATCH);
    await Promise.all(batch.map(async (player) => {
      const url = await fetchSteamAvatar(player.steamid);
      if (url) player.avatar = url;
    }));
  }

  return players;
}



const PORT = process.env.PORT || 3000;
const SITE_DIR = path.join(__dirname, 'site_completo');
const SINGLE_DIR = path.join(__dirname, 'site_completo_single');
const ASSETS_DIR = path.join(__dirname, 'loja_terrahostil_assets');
const DATA_FILE = path.join(SITE_DIR, 'data', 'leaderboard.json');
const VIDEO_PATH = fs.existsSync(path.join(__dirname, 'videos', 'rust_bg.mp4')) 
  ? path.join(__dirname, 'videos', 'rust_bg.mp4') 
  : path.join(SITE_DIR, 'videos', 'rust_bg.mp4');

// Carregar o vídeo na memória (RAM) para evitar vazamento de file descriptors (EMFILE)
let videoBuffer = null;
try {
  if (fs.existsSync(VIDEO_PATH)) {
    videoBuffer = fs.readFileSync(VIDEO_PATH);
    console.log(`[Cache] Vídeo de fundo carregado na RAM (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB). Streaming ultrarrápido ativado.`);
  }
} catch (e) {
  console.error('[Cache] Não foi possível pré-carregar o vídeo:', e.message);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

// Cache de status do servidor Rust (A2S_INFO)
let serverStatusCache = {
  data: {
    online: false,
    serverName: '[BR/LATAM] Horizon 2x | Solo/Duo/Trio',
    map: 'Procedural Map',
    players: 0,
    maxPlayers: 100
  },
  lastFetch: 0
};

function parseA2SInfo(msg) {
  let offset = 6;
  const nameEnd = msg.indexOf(0, offset);
  const serverName = msg.subarray(offset, nameEnd).toString('utf-8');
  offset = nameEnd + 1;
  const mapEnd = msg.indexOf(0, offset);
  const map = msg.subarray(offset, mapEnd).toString('utf-8');
  offset = mapEnd + 1;
  const folderEnd = msg.indexOf(0, offset);
  offset = folderEnd + 1;
  const gameEnd = msg.indexOf(0, offset);
  offset = gameEnd + 1;
  offset += 2; // ID
  const rawPlayers = msg.readUInt8(offset);
  const maxPlayers = msg.readUInt8(offset + 1);
  offset += 3; // players, maxPlayers, bots
  offset += 4; // serverType, environment, visibility, vac
  const versionEnd = msg.indexOf(0, offset);
  offset = versionEnd + 1;

  let realPlayers = rawPlayers;
  let realMaxPlayers = maxPlayers;
  let queuePlayers = 0;
  let keywords = '';

  if (offset < msg.length) {
    const edf = msg.readUInt8(offset);
    offset += 1;
    if (edf & 0x80) offset += 2; // port
    if (edf & 0x10) offset += 8; // steamId
    if (edf & 0x40) {
      offset += 2; // spectator port
      offset = msg.indexOf(0, offset) + 1; // spectator server name
    }
    if (edf & 0x20) { // keywords / tags
      const tagsEnd = msg.indexOf(0, offset);
      keywords = msg.subarray(offset, tagsEnd).toString('utf-8');
      offset = tagsEnd + 1;
    }
  }

  // Rust tags: cp<N> = real active players online
  if (keywords) {
    const cpMatch = keywords.match(/\bcp(\d+)\b/);
    if (cpMatch) realPlayers = parseInt(cpMatch[1], 10);
    const mpMatch = keywords.match(/\bmp(\d+)\b/);
    if (mpMatch) realMaxPlayers = parseInt(mpMatch[1], 10);
    const qpMatch = keywords.match(/\bqp(\d+)\b/);
    if (qpMatch) queuePlayers = parseInt(qpMatch[1], 10);
  }

  return {
    online: true,
    serverName,
    map,
    players: realPlayers,
    maxPlayers: realMaxPlayers,
    queuePlayers,
    updatedAt: new Date().toISOString()
  };
}

function fetchLiveStatus(host = '179.198.115.201', port = 28016, timeoutMs = 2500) {
  const now = Date.now();
  if (now - serverStatusCache.lastFetch < 15000 && serverStatusCache.data) {
    return Promise.resolve(serverStatusCache.data);
  }

  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4');
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { client.close(); } catch(e){}
        resolve(serverStatusCache.data);
      }
    }, timeoutMs);

    const header = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]);
    const payload = Buffer.from('Source Engine Query\0', 'ascii');
    const A2S_INFO = Buffer.concat([header, payload]);

    client.on('error', () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        try { client.close(); } catch(e){}
        resolve(serverStatusCache.data);
      }
    });

    client.on('message', (msg) => {
      if (finished) return;

      if (msg[4] === 0x41) { // Challenge response
        const challenge = msg.subarray(5, 9);
        const req = Buffer.concat([A2S_INFO, challenge]);
        client.send(req, port, host);
        return;
      }

      if (msg[4] === 0x49) { // A2S_INFO response
        finished = true;
        clearTimeout(timer);
        try {
          const result = parseA2SInfo(msg);
          client.close();
          serverStatusCache = { data: result, lastFetch: Date.now() };
          resolve(result);
        } catch (err) {
          try { client.close(); } catch(e){}
          resolve(serverStatusCache.data);
        }
      }
    });

    client.send(A2S_INFO, port, host);
  });
}


// -------------------------------------------------------------
// CACHE E BUSCA DE NOTÍCIAS OFICIAIS DA FACEPUNCH (RUST)
// -------------------------------------------------------------
let newsCache = {
  data: [
    {
      title: 'Halloween 2026',
      date: '22 de outubro de 2026',
      image: 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg',
      link: 'https://rust.facepunch.com/news/halloween-2026/',
      description: 'Darkness falls upon the island as monsters re-awaken from their slumber. The rifts open in random locations, leading to who-knows-where. Enter if you dare!'
    },
    {
      title: 'Livestock Update',
      date: '1 de outubro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/September/livestock_blog.jpg',
      link: 'https://rust.facepunch.com/news/livestock/',
      description: "This month's update brings a major refresh to farming with the introduction of new Livestock animals, critters, and swimming improvements."
    },
    {
      title: 'Breach and Clear',
      date: '3 de setembro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/Skinkbreach-and-clear_media.jpg',
      link: 'https://rust.facepunch.com/news/breach-and-clear/',
      description: "This month's update brings you Monument Blockers, Breakable Attack Heli Armour, HQM Nodes, Upkeep Group Scaling, and various QoL fixes."
    },
    {
      title: 'Power Trip',
      date: '6 de agosto de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/pt_hero.jpg',
      link: 'https://rust.facepunch.com/news/power-trip/',
      description: "This month's update brings you Player Maintained Monuments in the form of a new Satellite Crash, Dome Pumping, restorable power, and more."
    },
    {
      title: 'Common Ground',
      date: '2 de julho de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg',
      link: 'https://rust.facepunch.com/news/common-ground/',
      description: "This month's update features a New Monument: The Apartment Complex, Rentable Shops, a New Clan System & Table, plus QoL changes and much more!"
    },
    {
      title: 'Built Different',
      date: '4 de junho de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/Rust%20x%20Built%20Different%20Hero%20-%20Alternative.jpg',
      link: 'https://rust.facepunch.com/news/built-different/',
      description: "This month's update brings Rust's biggest player overhaul in years, featuring new player models and animations, a new armour set, and the M16A2 rifle."
    },
    {
      title: 'Upgrade hard, raid harder',
      date: '7 de maio de 2026',
      image: 'https://files.facepunch.com/lewis/1b0111b1/raid-harder.jpg',
      link: 'https://rust.facepunch.com/news/upgrade-hard-raid-harder/',
      description: "This month's update brings you Workbench upgrades, the new Mortar, improved Tin Can Alarm, as well as model refreshes and remakes, plus many QoL fixes."
    },
    {
      title: 'Spring Clean',
      date: '2 de abril de 2026',
      image: 'https://files.facepunch.com/Flavien/spring_clean-blogheader.jpg',
      link: 'https://rust.facepunch.com/news/spring-clean/',
      description: "This month's update brings you TWO new items - the Armoured Ladder Hatch and Water Wheel, additionally loads of QOL improvements, bug fixes, better performance."
    },
    {
      title: 'Shipshape',
      date: '5 de março de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/rust_shipshape_hero.jpg',
      link: 'https://rust.facepunch.com/news/shipshape/',
      description: "This month's update brings massive improvements to how you live, build, and fight on water and in The Deep Sea, plus extended daytime."
    },
    {
      title: 'Lunar New Year 2026',
      date: '17 de fevereiro de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/lny_blog_hero.jpg',
      link: 'https://rust.facepunch.com/news/lunar-new-year-2026/',
      description: "2026's Lunar New Year celebrations have begun! Celebrate the occasion by honouring the Year of the Horse with the Ornate Horse Mask, Horse Armour, and more."
    }
  ],
  lastFetch: 0
};

function formatPtBrDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  } catch(e) {
    return dateStr;
  }
}

function fetchFacepunchNews() {
  const now = Date.now();
  if (now - newsCache.lastFetch < 1800000 && newsCache.data && newsCache.data.length > 0) {
    return Promise.resolve(newsCache.data);
  }

  return new Promise((resolve) => {
    https.get('https://rust.facepunch.com/rss/news', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, (res) => {
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
            const title = (it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
            const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
            const pubDate = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
            const unescaped = it.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            let img = (unescaped.match(/src="([^"]+\.(?:jpg|png|jpeg|webp))"/i) || [])[1] || '';
            if (!img && title.toLowerCase().includes('halloween')) {
              img = 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg';
            }
            if (!img) {
              img = 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg';
            }
            const descMatch = unescaped.match(/<description>([\s\S]*?)<\/description>/);
            let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (desc.length > 150) desc = desc.slice(0, 147) + '...';

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
        } catch(e) {}
        resolve(newsCache.data);
      });
    }).on('error', () => resolve(newsCache.data));
  });
}

function resolveFile(cleanUrl) {

  if (cleanUrl === '/single' || cleanUrl === '/menu') {
    return '__MENU__';
  }

  if (cleanUrl.startsWith('/single/')) {
    const pageName = cleanUrl.replace('/single/', '').replace(/\.html$/, '');
    const singlePath = path.join(SINGLE_DIR, `${pageName}.html`);
    if (fs.existsSync(singlePath)) return singlePath;
  }

  const relPath = cleanUrl === '/' ? '' : cleanUrl.replace(/^\//, '');

  // Priorizar arquivos da raiz (mesmo comportamento da Vercel)
  const rootIndex = path.join(__dirname, relPath, 'index.html');
  if (fs.existsSync(rootIndex) && fs.statSync(rootIndex).isFile()) {
    return rootIndex;
  }

  const rootDirect = path.join(__dirname, relPath);
  if (fs.existsSync(rootDirect) && fs.statSync(rootDirect).isFile()) {
    return rootDirect;
  }

  const dirIndex = path.join(SITE_DIR, relPath, 'index.html');
  if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
    return dirIndex;
  }

  const directFile = path.join(SITE_DIR, relPath);
  if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
    return directFile;
  }

  const assetDirect = path.join(ASSETS_DIR, relPath);
  if (fs.existsSync(assetDirect) && fs.statSync(assetDirect).isFile()) {
    return assetDirect;
  }

  const baseName = path.basename(cleanUrl);
  const possiblePaths = [
    path.join(SITE_DIR, 'css', baseName),
    path.join(SITE_DIR, 'js', baseName),
    path.join(SITE_DIR, 'fonts', baseName),
    path.join(SITE_DIR, 'videos', baseName),
    path.join(ASSETS_DIR, 'css', baseName),
    path.join(ASSETS_DIR, 'js', baseName),
    path.join(ASSETS_DIR, 'fonts', baseName)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }

  const defaultIndex = path.join(SITE_DIR, 'index.html');
  if (fs.existsSync(defaultIndex)) {
    return defaultIndex;
  }

  return null;
}


// -------------------------------------------------------------
// SISTEMA DE AUTENTICAÇÃO STEAM OPENID 2.0
// -------------------------------------------------------------
const SESSION_SECRET = 'horizon-rust-session-secret-key-2026';

function signData(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts.shift().trim();
      if (name) {
        try {
          list[name] = decodeURIComponent(parts.join('='));
        } catch (e) {
          list[name] = parts.join('=');
        }
      }
    });
  }
  return list;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const userJson = cookies['horizon_user'];
  const sig = cookies['horizon_sig'];
  if (!userJson || !sig) return null;
  if (signData(userJson) !== sig) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}

function getBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host || 'localhost:3000';
  const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function fetchSteamProfile(steamId64) {
  const accountId = (BigInt(steamId64) - 76561197960265728n).toString();
  const url = `https://steamcommunity.com/miniprofile/${accountId}/json/`;

  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 6000 }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const name = data.persona_name || `Player_${steamId64.slice(-4)}`;
          let avatar = data.avatar_url || DEFAULT_AVATAR;
          avatar = avatar.replace(/\\\//g, '/');
          resolve({ steamId: steamId64, steamid: steamId64, name, avatar, level: data.level || 0 });
        } catch (e) {
          resolve({ steamId: steamId64, steamid: steamId64, name: `Player_${steamId64.slice(-4)}`, avatar: DEFAULT_AVATAR });
        }
      });
    });
    req.on('error', () => {
      resolve({ steamId: steamId64, steamid: steamId64, name: `Player_${steamId64.slice(-4)}`, avatar: DEFAULT_AVATAR });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ steamId: steamId64, steamid: steamId64, name: `Player_${steamId64.slice(-4)}`, avatar: DEFAULT_AVATAR });
    });
  });
}

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];

  // -------------------------------------------------------------
  // ROTAS: AUTENTICAÇÃO STEAM OPENID
  // -------------------------------------------------------------
  if (cleanUrl === '/auth/steam' || cleanUrl === '/api/auth/steam') {
    const baseUrl = getBaseUrl(req);
    const returnTo = `${baseUrl}/auth/steam/return`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': `${baseUrl}/`,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    const steamLoginUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;
    console.log(`[Steam Auth] Redirecionando para login Steam oficial: ${returnTo}`);
    res.writeHead(302, { 'Location': steamLoginUrl });
    res.end();
    return;
  }

  if (cleanUrl === '/auth/steam/return' || cleanUrl === '/api/auth/return' || cleanUrl === '/api/auth/steam/return') {
    const baseUrl = getBaseUrl(req);
    const urlObj = new URL(req.url, baseUrl);
    const searchParams = urlObj.searchParams;

    if (searchParams.get('openid.mode') !== 'id_res') {
      console.warn('[Steam Auth] Login cancelado pelo usuário na Steam.');
      res.writeHead(302, { 'Location': '/?auth=cancelled' });
      res.end();
      return;
    }

    // Validação com o servidor OpenID da Steam
    const verifyParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      verifyParams.append(key, value);
    }
    verifyParams.set('openid.mode', 'check_authentication');

    const postData = verifyParams.toString();
    const verifyReq = https.request('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    }, (verifyRes) => {
      let body = '';
      verifyRes.on('data', chunk => { body += chunk; });
      verifyRes.on('end', async () => {
        if (body.includes('is_valid:true')) {
          const claimedId = searchParams.get('openid.claimed_id') || '';
          const match = claimedId.match(/\/id\/(\d+)/);
          const steamId = match ? match[1] : null;

          if (!steamId) {
            res.writeHead(302, { 'Location': '/?error=invalid_steam_id' });
            res.end();
            return;
          }

          console.log(`[Steam Auth] Jogador validado com sucesso! SteamID: ${steamId}`);
          const profile = await fetchSteamProfile(steamId);
          const userJson = JSON.stringify(profile);
          const sig = signData(userJson);

          const isHttps = baseUrl.startsWith('https');
          const secureFlag = isHttps ? '; Secure' : '';

          res.writeHead(302, {
            'Location': '/?login=success',
            'Set-Cookie': [
              `horizon_user=${encodeURIComponent(userJson)}; Path=/; Max-Age=2592000; SameSite=Lax${secureFlag}`,
              `horizon_sig=${sig}; Path=/; Max-Age=2592000; SameSite=Lax${secureFlag}; HttpOnly`
            ]
          });
          res.end();
        } else {
          console.error('[Steam Auth] Falha na validação de assinatura Steam:', body);
          res.writeHead(302, { 'Location': '/?error=steam_verification_failed' });
          res.end();
        }
      });
    });

    verifyReq.on('error', (err) => {
      console.error('[Steam Auth] Erro de rede ao contatar Steam:', err);
      res.writeHead(302, { 'Location': '/?error=steam_network_error' });
      res.end();
    });

    verifyReq.write(postData);
    verifyReq.end();
    return;
  }

  if (cleanUrl === '/auth/logout' || cleanUrl === '/api/auth/logout') {
    res.writeHead(302, {
      'Location': '/',
      'Set-Cookie': [
        'horizon_user=; Path=/; Max-Age=0; SameSite=Lax',
        'horizon_sig=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
      ]
    });
    res.end();
    return;
  }

  // Rota de login simulado (útil para testes rápidos)
  if (cleanUrl === '/auth/demo-login' || cleanUrl === '/api/auth/demo-login') {
    const profile = {
      steamId: '76561198358586780',
      steamid: '76561198358586780',
      name: 'Whillikat🌹',
      avatar: 'https://avatars.fastly.steamstatic.com/22440c345d7bc45b6ef39a5ce3c01178f031fc21_full.jpg',
      level: 21
    };
    const userJson = JSON.stringify(profile);
    const sig = signData(userJson);
    res.writeHead(302, {
      'Location': '/?login=success',
      'Set-Cookie': [
        `horizon_user=${encodeURIComponent(userJson)}; Path=/; Max-Age=2592000; SameSite=Lax`,
        `horizon_sig=${sig}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`
      ]
    });
    res.end();
    return;
  }

  if (cleanUrl === '/api/me') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const user = getSessionUser(req);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (user) {
      res.end(JSON.stringify({ authenticated: true, user }));
    } else {
      res.end(JSON.stringify({ authenticated: false }));
    }
    return;
  }


  // -------------------------------------------------------------
  // API: SERVER STATUS (PLAYERS COUNT)
  // -------------------------------------------------------------
  
  // -------------------------------------------------------------
  // API: NOTÍCIAS FACEPUNCH (RUST OFICIAL)
  // -------------------------------------------------------------
  if (cleanUrl === '/api/noticias') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    fetchFacepunchNews().then((noticias) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(noticias));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(newsCache.data));
    });
    return;
  }

  if (cleanUrl === '/api/status') {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    fetchLiveStatus().then((info) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(info));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(serverStatusCache.data));
    });
    return;
  }

  // -------------------------------------------------------------
  // API: LEADERBOARD ENDPOINTS
  // -------------------------------------------------------------
  if (cleanUrl === '/api/leaderboard') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, Bypass-Tunnel-Reminder');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      if (fs.existsSync(DATA_FILE)) {
        try {
          const data = fs.readFileSync(DATA_FILE, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(data);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nenhum dado registrado ainda.' }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          parsed.updated_at = new Date().toISOString();

          // Enriquecer avatares em background (não bloqueia a resposta)
          const allPlayers = [
            ...(parsed.pvp || []),
            ...(parsed.recursos || []),
            ...(parsed.farming || [])
          ];

          // Responde imediatamente ao plugin
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Dados do ranking atualizados com sucesso!' }));

          // Busca avatares e salva versão enriquecida
          enrichAvatars(allPlayers).then(() => {
            // Atualiza os players dentro do parsed com os avatares obtidos
            // (os arrays compartilham referências aos objetos)
            parsed.updated_at = new Date().toISOString();
            const targetPaths = [
              DATA_FILE,
              path.join(__dirname, 'data', 'leaderboard.json'),
              path.join(SITE_DIR, 'data', 'leaderboard.json')
            ];
            for (const tp of new Set(targetPaths)) {
              try {
                fs.mkdirSync(path.dirname(tp), { recursive: true });
                fs.writeFileSync(tp, JSON.stringify(parsed, null, 2), 'utf-8');
              } catch (errSync) {}
            }
            const comAvatar = allPlayers.filter(p => p.avatar && !p.avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb')).length;
            console.log(`[API] Leaderboard atualizado! ${allPlayers.length} jogadores, ${comAvatar} com avatar real do Steam.`);
          }).catch(() => {});

        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido', details: err.message }));
        }
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // API: FEED HORIZON (REDE SOCIAL EXCLUSIVA STEAM)
  // -------------------------------------------------------------
  if (cleanUrl === '/api/feed') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const feedHandler = require('./api/feed');

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          req.body = body ? JSON.parse(body) : {};
        } catch (e) {
          req.body = {};
        }
        try {
          await feedHandler(req, res);
        } catch (e) {
          console.error('[API Feed] Erro no handler:', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Erro interno ao processar feed' }));
        }
      });
      return;
    }

    Promise.resolve(feedHandler(req, res)).catch((e) => {
      console.error('[API Feed] Erro no handler GET:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro interno ao processar feed' }));
    });
    return;
  }

  // -------------------------------------------------------------
  // ARQUIVOS ESTÁTICOS
  // -------------------------------------------------------------
  const target = resolveFile(cleanUrl);

  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Arquivo não encontrado');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // STREAMING DE VÍDEO EM MEMÓRIA (Zero risco de EMFILE / Too many open files)
  if (ext === '.mp4' || ext === '.webm') {
    const buf = (target === VIDEO_PATH && videoBuffer) ? videoBuffer : fs.readFileSync(target);
    const fileSize = buf.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(buf.subarray(start, end + 1));
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(buf);
    }
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Erro: ${err.message}`);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[Servidor] Erro não capturado:', err.message);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\r\n==================================================`);
  console.log(`  🚀 SERVIDOR HORIZON ONLINE COM LEADERBOARD API!`);
  console.log(`==================================================`);
  console.log(`  Endereço principal: ${url}/`);
  console.log(`  Leaderboards:       ${url}/leaderboards`);
  console.log(`  API Endpoint:       ${url}/api/leaderboard`);
  console.log(`==================================================\r\n`);

  // Busca o status real do servidor Rust ao iniciar (warm-up do cache)
  fetchLiveStatus().then(info => {
    console.log(`[Status] Cache inicial: ${info.players} jogador(es) online no servidor Rust.`);
  }).catch(() => {});

  // Atualiza o status a cada 30 segundos em background (garante dado sempre fresco)
  setInterval(() => {
    serverStatusCache.lastFetch = 0; // força re-fetch
    fetchLiveStatus().then(info => {
      console.log(`[Status] Atualizado: ${info.players} jogador(es) online.`);
    }).catch(() => {});
  }, 30000);

  // Ao iniciar, enriquecer avatares dos dados já salvos com fotos reais do Steam
  if (fs.existsSync(DATA_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const all = [...(saved.pvp || []), ...(saved.recursos || []), ...(saved.farming || [])];
      if (all.length > 0) {
        console.log(`[Avatares] Buscando fotos do Steam para ${all.length} entradas de jogadores...`);
        enrichAvatars(all).then(() => {
          saved.updated_at = new Date().toISOString();
          const tps = [DATA_FILE, path.join(__dirname, 'data', 'leaderboard.json'), path.join(SITE_DIR, 'data', 'leaderboard.json')];
          for (const tp of new Set(tps)) {
            try { fs.mkdirSync(path.dirname(tp), { recursive: true }); fs.writeFileSync(tp, JSON.stringify(saved, null, 2), 'utf-8'); } catch(e) {}
          }
          const com = all.filter(p => p.avatar && !p.avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb')).length;
          console.log(`[Avatares] Concluído: ${com}/${all.length} avatares reais do Steam obtidos.`);
        }).catch(() => {});
      }
    } catch(e) { console.warn('[Avatares] Erro ao processar dados existentes:', e.message); }
  }
});
