const { getBaseUrl } = require('../_auth');

module.exports = async (req, res) => {
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

  res.writeHead(302, {
    'Location': steamLoginUrl,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end();
};

