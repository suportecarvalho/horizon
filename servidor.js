const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { exec } = require('child_process');

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

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];

  // -------------------------------------------------------------
  // API: SERVER STATUS (PLAYERS COUNT)
  // -------------------------------------------------------------
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
          console.log(`[API] Leaderboard atualizado pelo servidor Rust! Data: ${parsed.updated_at}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Dados do ranking atualizados com sucesso!' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido', details: err.message }));
        }
      });
      return;
    }
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
});
