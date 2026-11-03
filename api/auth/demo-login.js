const { signData, getBaseUrl } = require('../_auth');

module.exports = async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const profile = {
    steamId: '76561198358586780',
    steamid: '76561198358586780',
    name: 'Whillikat🌹',
    avatar: 'https://avatars.fastly.steamstatic.com/22440c345d7bc45b6ef39a5ce3c01178f031fc21_full.jpg',
    level: 10
  };

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
};
