const { attachResHelpers } = require('./_res');
const createHandler = require('./_checkout/create');
const statusHandler = require('./_checkout/status');
const webhookHandler = require('./_checkout/webhook');
const couponHandler = require('./_checkout/coupon');

module.exports = async (req, res) => {
  attachResHelpers(req, res);

  const url = (req.url || '').split('?')[0];
  const action = req.query.action || '';

  if (url.endsWith('/create') || action === 'create') {
    return await createHandler(req, res);
  }

  if (url.endsWith('/status') || action === 'status') {
    return await statusHandler(req, res);
  }

  if (url.endsWith('/webhook') || action === 'webhook') {
    return await webhookHandler(req, res);
  }

  if (url.endsWith('/coupon') || action === 'coupon') {
    return await couponHandler(req, res);
  }

  return res.status(404).json({ error: 'Endpoint de checkout não encontrado' });
};
