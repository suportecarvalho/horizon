const https = require('https');

const TEAM_MEMBERS = [
  { id: '76561198737554294', name: 'Krav' },
  { id: '76561199127717531', name: 'Althoff' },
  { id: '76561198411523793', name: 'Lorenzetti' }
];

let cacheData = null;
let lastFetch = 0;
const CACHE_TTL_MS = 60000; // 60 segundos

function fetchMemberStatus(member) {
  return new Promise((resolve) => {
    const req = https.get(`https://steamcommunity.com/profiles/${member.id}/?xml=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const stateMatch = data.match(/<onlineState>(.*?)<\/onlineState>/);
          const rawState = (stateMatch ? stateMatch[1] : 'offline').toLowerCase();
          
          let state = 'offline';
          let label = 'Offline na Steam';

          if (rawState === 'in-game' || rawState === 'in game') {
            state = 'in-game';
            label = 'Jogando na Steam';
          } else if (rawState === 'online') {
            state = 'online';
            label = 'Online na Steam';
          } else if (rawState === 'away' || rawState === 'snooze' || rawState === 'busy') {
            state = 'away';
            label = 'Ausente na Steam';
          }

          const avatarMatch = data.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
          const avatar = avatarMatch ? avatarMatch[1] : null;

          const personaMatch = data.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
          const steamName = personaMatch ? personaMatch[1] : member.name;

          resolve({
            id: member.id,
            name: member.name,
            steamName,
            state,
            label,
            avatar
          });
        } catch (e) {
          resolve({
            id: member.id,
            name: member.name,
            state: 'offline',
            label: 'Offline na Steam',
            avatar: null
          });
        }
      });
    });

    req.on('error', () => {
      resolve({
        id: member.id,
        name: member.name,
        state: 'offline',
        label: 'Offline na Steam',
        avatar: null
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        id: member.id,
        name: member.name,
        state: 'offline',
        label: 'Offline na Steam',
        avatar: null
      });
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();
  if (cacheData && (now - lastFetch < CACHE_TTL_MS)) {
    return res.status(200).json(cacheData);
  }

  try {
    const results = await Promise.all(TEAM_MEMBERS.map(fetchMemberStatus));
    const membersMap = {};
    results.forEach(m => {
      membersMap[m.id] = m;
    });

    cacheData = {
      success: true,
      members: membersMap,
      updatedAt: new Date().toISOString()
    };
    lastFetch = now;

    return res.status(200).json(cacheData);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar disponibilidade da equipe' });
  }
};
