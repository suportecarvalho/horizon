const { getPendingDeliveries, getOrder } = require('../_orders');
const { getMPConfig, searchRecentPayments } = require('../_mercadopago');
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
    let pending = await getPendingDeliveries();

    // Consulta pagamentos recentes aprovados no Mercado Pago para garantir entrega em tempo real
    try {
      const recent = await searchRecentPayments(30);
      for (const p of recent) {
        if (p && p.status === 'approved' && p.metadata && p.metadata.steam_id) {
          const meta = p.metadata;
          const orderId = meta.order_id || `MP-${p.id}`;

          // Se já está na lista pendente, pula
          const alreadyPending = pending.some(o => o.id === orderId || String(o.payment_id) === String(p.id));
          if (!alreadyPending) {
            // Verifica se este pedido já foi entregue anteriormente
            const existing = (await getOrder(orderId)) || (await getOrder(String(p.id)));
            if (!existing || !existing.granted) {
              const approvedAt = p.date_approved || new Date().toISOString();
              const expiresAt = new Date(new Date(approvedAt).getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString();

              pending.push({
                id: orderId,
                payment_id: String(p.id),
                steam_id: String(meta.steam_id),
                player_name: meta.player_name || 'Jogador',
                vip_tier: meta.vip_tier || 'bronze',
                status: 'approved',
                granted: false,
                approved_at: approvedAt,
                expires_at: expiresAt
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[VIP Pending MP Search Warning]:', e.message);
    }

    const formatted = [];
    for (const order of pending) {
      const rawData = (typeof order.raw_data === 'string')
        ? (() => { try { return JSON.parse(order.raw_data); } catch (e) { return {}; } })()
        : (order.raw_data || {});
      const items = Array.isArray(rawData.items) && rawData.items.length > 0
        ? rawData.items
        : (Array.isArray(order.items) && order.items.length > 0
            ? order.items
            : (order.vip_tier && order.vip_tier.includes(',') ? order.vip_tier.split(',') : [order.vip_tier || 'bronze']));

      const grantedItems = Array.isArray(order.granted_items) ? order.granted_items : [];

      if (items.length > 1) {
        items.forEach((it, idx) => {
          const tier = String(it).toLowerCase().trim();
          const subKey = `${tier}_${idx}`;
          if (grantedItems.includes(subKey) || (grantedItems.includes(tier) && items.filter(x => x === tier).length === 1)) {
            return;
          }

          const kit = (config.kits && config.kits[tier]) || {
            name: `VIP ${tier.toUpperCase()}`,
            group: `vip_${tier}`,
            kitPermission: `kits.vip${tier}`
          };

          formatted.push({
            orderId: `${order.id}__${subKey}`,
            paymentId: order.payment_id,
            steamId: String(order.steam_id),
            playerName: order.player_name || 'Jogador',
            vipTier: tier,
            groupName: kit.group || `vip_${tier}`,
            kitPermission: kit.kitPermission || `kits.vip${tier}`,
            approvedAt: order.approved_at,
            expiresAt: order.expires_at,
            durationDays: 30
          });
        });
      } else {
        const tier = (items[0] || 'bronze').toLowerCase().trim();
        const kit = (config.kits && config.kits[tier]) || {
          name: `VIP ${tier.toUpperCase()}`,
          group: `vip_${tier}`,
          kitPermission: `kits.vip${tier}`
        };

        formatted.push({
          orderId: order.id,
          paymentId: order.payment_id,
          steamId: String(order.steam_id),
          playerName: order.player_name || 'Jogador',
          vipTier: tier,
          groupName: kit.group || `vip_${tier}`,
          kitPermission: kit.kitPermission || `kits.vip${tier}`,
          approvedAt: order.approved_at,
          expiresAt: order.expires_at,
          durationDays: 30
        });
      }
    }

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
