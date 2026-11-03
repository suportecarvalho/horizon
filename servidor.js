const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SITE_DIR = path.join(__dirname, 'site_completo');
const SINGLE_DIR = path.join(__dirname, 'site_completo_single');
const ASSETS_DIR = path.join(__dirname, 'loja_terrahostil_assets');
const DATA_FILE = path.join(SITE_DIR, 'data', 'leaderboard.json');
const VIDEO_PATH = path.join(SITE_DIR, 'videos', 'rust_bg.mp4');

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

  const rootIndex = path.join(SITE_DIR, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return rootIndex;
  }

  return null;
}

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];

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
          fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
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
  console.log(`\n==================================================`);
  console.log(`  🚀 SERVIDOR HORIZON ONLINE COM LEADERBOARD API!`);
  console.log(`==================================================`);
  console.log(`  Endereço principal: ${url}/`);
  console.log(`  Leaderboards:       ${url}/leaderboards`);
  console.log(`  API Endpoint:       ${url}/api/leaderboard`);
  console.log(`==================================================\n`);
});
