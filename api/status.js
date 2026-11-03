const dgram = require('dgram');

let serverStatusCache = {
  data: {
    online: true,
    serverName: '[BR/LATAM] Horizon 2x | Solo/Duo/Trio',
    map: 'Procedural Map',
    players: 3,
    maxPlayers: 100
  },
  lastFetch: 0
};

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
          offset += 2;
          const players = msg.readUInt8(offset);
          const maxPlayers = msg.readUInt8(offset + 1);
          client.close();

          const result = {
            online: true,
            serverName,
            map,
            players,
            maxPlayers,
            updatedAt: new Date().toISOString()
          };
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
