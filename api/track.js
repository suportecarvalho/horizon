const { recordVisit } = require('./_analytics');
const { attachResHelpers } = require('./_res');

function parseUserAgent(ua) {
  ua = ua || '';
  let device = 'Desktop';
  let browser = 'Chrome';
  let os = 'Windows';

  // Device
  if (/mobile/i.test(ua)) device = 'Mobile';
  if (/tablet|ipad/i.test(ua)) device = 'Tablet';

  // OS
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  // Browser
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/chrome/i.test(ua)) browser = 'Chrome';

  return { device, browser, os };
}

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    body = body || {};

    const ua = req.headers['user-agent'] || '';
    const parsedUa = parseUserAgent(ua);

    const country = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || 'BR';
    const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Brasil';

    const visit = await recordVisit({
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      path: body.path || '/',
      title: body.title || 'Horizon',
      referrer: body.referrer || (req.headers['referer'] || 'Direto'),
      device: body.device || parsedUa.device,
      browser: body.browser || parsedUa.browser,
      os: body.os || parsedUa.os,
      country,
      city,
      screen: body.screen || ''
    });

    return res.status(200).json({ success: true, recorded: true, id: visit.id });
  } catch (err) {
    console.error('[Track Error]:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
};

