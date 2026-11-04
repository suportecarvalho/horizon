const { getOrder, approveOrder, saveOrder } = require('../_orders');
const { getPayment, searchRecentPayments } = require('../_mercadopago');
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
  const paymentId = req.query.paymentId || req.query.payment_id;

  if (!orderId && !paymentId) {
    return res.status(400).json({ error: 'Parâmetro orderId ou paymentId obrigatório' });
  }

  try {
    let order = orderId ? await getOrder(orderId) : null;

    // Se temos paymentId direto, consulta o Mercado Pago
    let mpPayment = null;
    if (paymentId && !paymentId.startsWith('sim-')) {
      try {
        mpPayment = await getPayment(paymentId);
      } catch (e) {
        console.warn('[Checkout Status] Erro ao buscar pagamento direto:', e.message);
      }
    }

    // Se não encontrou o pedido localmente, tenta buscar nos pagamentos recentes do Mercado Pago
    if (!order && !mpPayment && orderId) {
      try {
        const recent = await searchRecentPayments(30);
        mpPayment = recent.find(p => {
          if (!p) return false;
          const meta = p.metadata || {};
          return String(p.id) === String(orderId) ||
                 meta.order_id === orderId ||
                 meta.orderid === orderId ||
                 (meta.steam_id && orderId.includes(meta.vip_tier || ''));
        });
      } catch (e) {
        console.warn('[Checkout Status] Erro ao buscar recentes no MP:', e.message);
      }
    }

    // Se encontramos dados no Mercado Pago
    if (mpPayment) {
      const meta = mpPayment.metadata || {};
      const resolvedOrderId = orderId || meta.order_id || `MP-${mpPayment.id}`;
      const isApproved = mpPayment.status === 'approved';
      const approvedAt = mpPayment.date_approved || (isApproved ? new Date().toISOString() : null);
      const expiresAt = approvedAt ? new Date(new Date(approvedAt).getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString() : null;

      if (!order) {
        order = {
          id: resolvedOrderId,
          payment_id: String(mpPayment.id),
          steam_id: meta.steam_id || '',
          player_name: meta.player_name || 'Jogador',
          vip_tier: meta.vip_tier || 'bronze',
          amount: mpPayment.transaction_amount || 0,
          status: mpPayment.status,
          granted: false,
          created_at: mpPayment.date_created || new Date().toISOString(),
          approved_at: approvedAt,
          expires_at: expiresAt,
          raw_data: mpPayment
        };
        await saveOrder(order);
      } else if (isApproved && order.status !== 'approved') {
        order = await approveOrder(order.id, {
          payment_id: mpPayment.id,
          raw_data: mpPayment
        });
      }
    }

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
        const mp = await getPayment(order.payment_id);
        if (mp && mp.status === 'approved') {
          order = await approveOrder(order.id, {
            payment_id: mp.id,
            raw_data: mp
          });
        }
      } catch (e) {
        console.warn('[Checkout Status] Erro ao consultar MP:', e.message);
      }
    }

    return res.status(200).json({
      orderId: order.id,
      paymentId: order.payment_id,
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
