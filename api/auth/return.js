const https = require('https');
const { getBaseUrl, fetchSteamProfile, signData } = require('../_auth');

module.exports = async (req, res) => {
  const baseUrl = getBaseUrl(req);
  
  // Parse query params (req.query on Vercel or URL search params)
  const queryParams = new URLSearchParams();
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) {
        v.forEach(val => queryParams.append(k, val));
      } else if (v !== undefined) {
        queryParams.append(k, String(v));
      }
    }
  } else {
    const urlObj = new URL(req.url, baseUrl);
    urlObj.searchParams.forEach((val, k) => queryParams.append(k, val));
  }

  const mode = queryParams.get('openid.mode');
  if (mode !== 'id_res') {
    res.writeHead(302, { 'Location': '/?auth=cancelled' });
    res.end();
    return;
  }

  // Steam OpenID check_authentication
  const verifyParams = new URLSearchParams();
  for (const [key, value] of queryParams.entries()) {
    verifyParams.append(key, value);
  }
  verifyParams.set('openid.mode', 'check_authentication');

  const postData = verifyParams.toString();

  const isValid = await new Promise((resolve) => {
    const verifyReq = https.request('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    }, (verifyRes) => {
      let body = '';
      verifyRes.on('data', chunk => { body += chunk; });
      verifyRes.on('end', () => {
        resolve(body.includes('is_valid:true'));
      });
    });

    verifyReq.on('error', () => resolve(false));
    verifyReq.on('timeout', () => {
      verifyReq.destroy();
      resolve(false);
    });

    verifyReq.write(postData);
    verifyReq.end();
  });

  if (!isValid) {
    res.writeHead(302, { 'Location': '/?error=steam_verification_failed' });
    res.end();
    return;
  }

  const claimedId = queryParams.get('openid.claimed_id') || '';
  const match = claimedId.match(/\/id\/(\d+)/);
  const steamId = match ? match[1] : null;

  if (!steamId) {
    res.writeHead(302, { 'Location': '/?error=invalid_steam_id' });
    res.end();
    return;
  }

  const profile = await fetchSteamProfile(steamId);
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

