const crypto = require('crypto');
const https = require('https');

const SESSION_SECRET = process.env.SESSION_SECRET || 'horizon-rust-session-secret-key-2026';
const DEFAULT_AVATAR = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

const ADMIN_STEAM_IDS = [
  '76561198750662826', // ADM Lucas / Dono Horizon
  '76561198737554294', // ADM configurado pelo usuário
  '76561199127717531'  // ADM oficial Horizon
];

function isAdmin(steamId) {
  if (!steamId) return false;
  const envAdmins = (process.env.ADMIN_STEAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ADMIN_STEAM_IDS.includes(steamId) || envAdmins.includes(steamId);
}

function signData(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers && req.headers.cookie;
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
    const user = JSON.parse(userJson);
    const sid = user.steamId || user.steamid;
    user.isAdmin = isAdmin(sid);
    return user;
  } catch (e) {
    return null;
  }
}

function getBaseUrl(req) {
  let proto = req.headers['x-forwarded-proto'] || '';
  if (proto.includes(',')) proto = proto.split(',')[0].trim();
  let host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  if (host.includes(',')) host = host.split(',')[0].trim();
  if (!proto) {
    proto = host.includes('localhost') ? 'http' : 'https';
  }
  return `${proto}://${host}`;
}

function fetchSteamProfile(steamId64) {
  try {
    const accountId = (BigInt(steamId64) - 76561197960265728n).toString();
    const url = `https://steamcommunity.com/miniprofile/${accountId}/json/`;

    return new Promise((resolve) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 6000
      }, (res) => {
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
  } catch (err) {
    return Promise.resolve({ steamId: steamId64, steamid: steamId64, name: `Player_${steamId64.slice(-4)}`, avatar: DEFAULT_AVATAR });
  }
}

module.exports = {
  signData,
  parseCookies,
  getSessionUser,
  getBaseUrl,
  fetchSteamProfile,
  isAdmin,
  ADMIN_STEAM_IDS,
  DEFAULT_AVATAR
};

