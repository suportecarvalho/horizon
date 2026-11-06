const dgram = require('dgram');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwgswqwqwrnpmcirajre.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Z3N3cXdxd3JucG1jaXJhanJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mzc0NzgxMiwiZXhwIjoyMTA5MzIzODEyfQ.GPb3PY0kWwQZwfSVo4wp6QC_3ee-cW0_OYiTkZVIW4U';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
  } catch (e) {}
}

const STATUS_DOC_ID = '__horizon_server_status_db__';

function calculateNextWipe(refDate = new Date()) {
  const d = new Date(refDate);
  const currentDay = d.getUTCDay();
  let daysUntilSaturday = (6 - currentDay + 7) % 7;
  if (daysUntilSaturday === 0 && d.getUTCHours() >= 15) {
    daysUntilSaturday = 7;
  }
  const nextSaturday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilSaturday, 15, 0, 0, 0));
  return nextSaturday.toISOString();
}

let serverStatusCache = {
  data: {
    online: true,
    serverName: '[BR/LATAM] Horizon 2x | Solo/Duo/Trio',
    map: 'Procedural Map',
    players: 6,
    maxPlayers: 100,
    queuePlayers: 0,
    wipedAt: 1793883961000,
    nextWipe: calculateNextWipe(),
    schedule: {
      mapWipe: "Todo Sábado às 12:00h",
      fullWipe: "1ª Quinta-feira do mês às 15:00h",
      type: "Horizon 2x Solo/Duo/Trio"
    },
    updatedAt: new Date().toISOString()
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
  let wipedAt = 1793883961000;

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

  // Rust dedicated server tag parsing:
  // cp<N> = real active players online
  // mp<N> = max players
  // qp<N> = queue players
  // born<N> = map wipe unix timestamp
  if (keywords) {
    const cpMatch = keywords.match(/\bcp(\d+)\b/);
    if (cpMatch) realPlayers = parseInt(cpMatch[1], 10);
    const mpMatch = keywords.match(/\bmp(\d+)\b/);
    if (mpMatch) realMaxPlayers = parseInt(mpMatch[1], 10);
    const qpMatch = keywords.match(/\bqp(\d+)\b/);
    if (qpMatch) queuePlayers = parseInt(qpMatch[1], 10);
    const bornMatch = keywords.match(/\bborn(\d+)\b/);
    if (bornMatch) wipedAt = parseInt(bornMatch[1], 10) * 1000;
  }

  return {
    online: true,
    serverName,
    map,
    players: realPlayers,
    maxPlayers: realMaxPlayers,
    queuePlayers,
    wipedAt,
    nextWipe: calculateNextWipe(),
    schedule: {
      mapWipe: "Todo Sábado às 12:00h",
      fullWipe: "1ª Quinta-feira do mês às 15:00h",
      type: "Horizon 2x Solo/Duo/Trio"
    },
    updatedAt: new Date().toISOString()
  };
}

function queryRustServer(host = '179.198.115.201', port = 28016, timeoutMs = 2500) {
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, Bypass-Tunnel-Reminder');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ---------------------------------------------------------------------------
  // POST: Recebe status sincronizado direto do plugin HorizonServerInfo na VPS
  // ---------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body) {
        return res.status(400).json({ error: 'Corpo da requisição vazio' });
      }

      const statusData = {
        online: true,
        serverName: body.serverName || '[BR/LATAM] Horizon 2x | Solo/Duo/Trio',
        map: body.map || 'Procedural Map',
        worldSize: body.worldSize || 3500,
        players: typeof body.players === 'number' ? body.players : 0,
        maxPlayers: typeof body.maxPlayers === 'number' ? body.maxPlayers : 100,
        queuePlayers: typeof body.queuePlayers === 'number' ? body.queuePlayers : 0,
        joiningPlayers: typeof body.joiningPlayers === 'number' ? body.joiningPlayers : 0,
        fps: body.fps || 250,
        entities: body.entities || 0,
        wipedAt: body.wipedAt || 1793883961000,
        nextWipe: calculateNextWipe(),
        schedule: {
          mapWipe: (body.schedule && body.schedule.mapWipe && !body.schedule.mapWipe.toLowerCase().includes('sexta')) ? body.schedule.mapWipe : "Todo Sábado às 12:00h",
          fullWipe: (body.schedule && body.schedule.fullWipe) ? body.schedule.fullWipe : "1ª Quinta-feira do mês às 15:00h",
          type: "Horizon 2x Solo/Duo/Trio"
        },
        updatedAt: new Date().toISOString()
      };

      // Atualizar cache em memória
      serverStatusCache = {
        data: statusData,
        lastFetch: Date.now()
      };

      // Persistir no Supabase para que todas as instâncias da Vercel vejam em tempo real
      if (supabase) {
        try {
          await supabase.from('feed_posts').upsert([{
            id: STATUS_DOC_ID,
            author_steamid: '0',
            author_name: 'Server Status Monitor',
            author_avatar: '',
            image_url: 'https://files.facepunch.com/rust/item/radar.png',
            caption: JSON.stringify(statusData),
            tag: '__system__'
          }], { onConflict: 'id' });
        } catch (errSupabase) {
          console.error('[Status Supabase Error]', errSupabase);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Status do servidor atualizado com sucesso via VPS!',
        data: statusData
      });
    } catch (err) {
      return res.status(400).json({ error: 'Erro ao processar status', details: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // GET: Retorna o status mais recente do servidor
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const now = Date.now();
    // 1. Se o cache em memória tiver menos de 15 segundos, retorna imediatamente
    if (serverStatusCache.data && (now - serverStatusCache.lastFetch < 15000)) {
      return res.status(200).json(serverStatusCache.data);
    }

    // 2. Tenta buscar o último status enviado pela VPS no Supabase
    if (supabase) {
      try {
        const { data: row } = await supabase
          .from('feed_posts')
          .select('caption, updated_at')
          .eq('id', STATUS_DOC_ID)
          .maybeSingle();

        if (row && row.caption) {
          const parsed = JSON.parse(row.caption);
          if (parsed && parsed.wipedAt) {
            // Garantir que o nextWipe esteja calculado
            if (!parsed.nextWipe) parsed.nextWipe = calculateNextWipe();
            serverStatusCache = { data: parsed, lastFetch: now };
            return res.status(200).json(parsed);
          }
        }
      } catch (e) {}
    }

    // 3. Fallback: Consulta direta A2S via UDP (funciona no servidor local / VPS)
    try {
      const data = await queryRustServer();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(200).json(serverStatusCache.data);
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
