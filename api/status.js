const dgram = require('dgram');

function calculateNextWipe(refDate = new Date()) {
  const d = new Date(refDate);
  const currentDay = d.getUTCDay();
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0 && d.getUTCHours() >= 21) {
    daysUntilFriday = 7;
  }
  const nextFriday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilFriday, 21, 0, 0, 0));
  return nextFriday.toISOString();
}

let serverStatusCache = {
  data: {
    online: true,
    serverName: '[BR/LATAM] Horizon 2x | Solo/Duo/Trio',
    map: 'Procedural Map',
    players: 6,
    maxPlayers: 100,
    wipedAt: 1793883961000,
    nextWipe: calculateNextWipe(),
    schedule: {
      mapWipe: "Toda Sexta-feira às 18:00h",
      fullWipe: "1ª Quinta-feira do mês às 15:00h",
      type: "Horizon 2x Solo/Duo/Trio"
    }
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
      mapWipe: "Toda Sexta-feira às 18:00h",
      fullWipe: "1ª Quinta-feira do mês às 15:00h",
      type: "Horizon 2x Solo/Duo/Trio"
    },
    updatedAt: new Date().toISOString()
  };
}

function queryRustServer(host = '179.198.115.201', port = 28016, timeoutMs = 2500) {
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const data = await queryRustServer();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json(serverStatusCache.data);
  }
};
