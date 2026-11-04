const { getActiveVipForPlayer } = require('../_orders');
const { attachResHelpers } = require('../_res');

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const steamId = req.query.steamId || req.query.steamid;
  if (!steamId) {
    return res.status(400).json({ error: 'steamId obrigatório' });
  }

  try {
    const activeVip = await getActiveVipForPlayer(steamId);

    if (!activeVip) {
      return res.status(200).json({
        hasVip: false,
        steamId,
        message: 'Nenhum VIP ativo para este SteamID.'
      });
    }

    const expiresAt = new Date(activeVip.expires_at);
    const now = new Date();
    const diffMs = expiresAt - now;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));

    return res.status(200).json({
      hasVip: true,
      steamId,
      tier: activeVip.vip_tier,
      amount: activeVip.amount,
      orderId: activeVip.id,
      approvedAt: activeVip.approved_at,
      expiresAt: activeVip.expires_at,
      daysRemaining,
      hoursRemaining
    });
  } catch (err) {
    console.error('[VIP Player Error]:', err);
    return res.status(500).json({ error: 'Erro ao consultar VIP do jogador', details: err.message });
  }
};
