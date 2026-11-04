const { markOrderGranted } = require('../_orders');
const { attachResHelpers } = require('../_res');

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    body = body || {};

    const { orderId } = body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId obrigatório' });
    }

    const success = await markOrderGranted(orderId);
    if (!success) {
      return res.status(404).json({ error: 'Pedido não encontrado ou já processado' });
    }

    console.log(`[VIP Confirm] Pedido ${orderId} confirmado como entregue com sucesso no servidor de Rust!`);
    return res.status(200).json({ success: true, message: 'VIP confirmado e entregue com sucesso!' });
  } catch (err) {
    console.error('[VIP Confirm Error]:', err);
    return res.status(500).json({ error: 'Erro ao confirmar entrega', details: err.message });
  }
};
