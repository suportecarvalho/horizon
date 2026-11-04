const { getOrder, approveOrder } = require('../_orders');
const { getPayment } = require('../_mercadopago');
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

  const orderId = req.query.orderId || req.query.id;
  if (!orderId) {
    return res.status(400).json({ error: 'Parâmetro orderId obrigatório' });
  }

  try {
    let order = await getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Suporte para simulação em ambiente de teste
    if (req.query.simulate === 'true' && order.status === 'pending') {
      order = await approveOrder(order.id, { simulated: true });
    }

    // Se ainda está pendente e possui payment_id real do Mercado Pago, consulta a API do MP
    if (order.status === 'pending' && order.payment_id && !order.payment_id.startsWith('sim-')) {
      try {
        const mpPayment = await getPayment(order.payment_id);
        if (mpPayment && mpPayment.status === 'approved') {
          order = await approveOrder(order.id, {
            payment_id: mpPayment.id,
            raw_data: mpPayment
          });
        }
      } catch (e) {
        console.warn('[Checkout Status] Erro ao consultar MP:', e.message);
      }
    }

    return res.status(200).json({
      orderId: order.id,
      status: order.status, // 'pending', 'approved', 'rejected'
      granted: !!order.granted,
      vipTier: order.vip_tier,
      amount: order.amount,
      steamId: order.steam_id,
      playerName: order.player_name,
      createdAt: order.created_at,
      approvedAt: order.approved_at,
      expiresAt: order.expires_at,
      daysRemaining: order.expires_at ? Math.max(0, Math.ceil((new Date(order.expires_at) - new Date()) / (1000 * 60 * 60 * 24))) : 30
    });
  } catch (err) {
    console.error('[Checkout Status Error]:', err);
    return res.status(500).json({ error: 'Erro ao consultar pedido', details: err.message });
  }
};
