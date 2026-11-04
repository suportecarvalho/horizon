const { getPendingDeliveries } = require('../_orders');
const { getMPConfig } = require('../_mercadopago');
const { attachResHelpers } = require('../_res');

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const config = getMPConfig();
    const pending = await getPendingDeliveries();

    const formatted = pending.map(order => {
      const kit = config.kits[order.vip_tier] || {
        name: `VIP ${order.vip_tier}`,
        group: `vip_${order.vip_tier}`,
        kitPermission: `kits.vip${order.vip_tier}`
      };

      return {
        orderId: order.id,
        paymentId: order.payment_id,
        steamId: String(order.steam_id),
        playerName: order.player_name || 'Jogador',
        vipTier: order.vip_tier,
        groupName: kit.group || `vip_${order.vip_tier}`,
        kitPermission: kit.kitPermission || `kits.vip${order.vip_tier}`,
        approvedAt: order.approved_at,
        expiresAt: order.expires_at,
        durationDays: 30
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      deliveries: formatted
    });
  } catch (err) {
    console.error('[VIP Pending Error]:', err);
    return res.status(500).json({ error: 'Erro ao buscar entregas pendentes', details: err.message });
  }
};
