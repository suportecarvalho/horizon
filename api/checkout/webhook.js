const { getPayment } = require('../_mercadopago');
const { approveOrder, getOrder } = require('../_orders');
const { attachResHelpers } = require('../_res');

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Mercado Pago pode enviar dados tanto via query string quanto via JSON body
  let paymentId = req.query.id || req.query['data.id'];
  let topic = req.query.topic || req.query.type;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  body = body || {};

  if (!paymentId && body.data && body.data.id) {
    paymentId = body.data.id;
  }
  if (!topic && body.type) {
    topic = body.type;
  }

  console.log(`[Mercado Pago Webhook] Recebida notificação: topic=${topic}, paymentId=${paymentId}`);

  // Se for notificação de pagamento
  if (paymentId) {
    try {
      const payment = await getPayment(paymentId);
      if (payment) {
        console.log(`[Mercado Pago Webhook] Pagamento ${paymentId} status: ${payment.status}`);

        if (payment.status === 'approved') {
          // Busca o pedido pelo external_reference ou metadata
          const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);

          if (orderId) {
            await approveOrder(orderId, {
              payment_id: payment.id,
              raw_data: payment
            });
            console.log(`[Mercado Pago Webhook] ✔ Pedido ${orderId} aprovado com sucesso! VIP concedido por 30 dias.`);
          } else {
            // Tenta aprovar pelo próprio paymentId
            await approveOrder(paymentId, {
              payment_id: payment.id,
              raw_data: payment
            });
          }
        }
      }
    } catch (e) {
      console.error('[Mercado Pago Webhook] Erro ao processar:', e.message);
    }
  }

  // Mercado Pago exige resposta HTTP 200/201 rápida
  return res.status(200).json({ received: true });
};
