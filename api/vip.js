const { attachResHelpers } = require('./_res');
const pendingHandler = require('./_vip/pending');
const confirmHandler = require('./_vip/confirm');
const playerHandler = require('./_vip/player');

module.exports = async (req, res) => {
  attachResHelpers(req, res);

  const url = (req.url || '').split('?')[0];
  const action = req.query.action || '';

  if (url.endsWith('/pending') || action === 'pending') {
    return await pendingHandler(req, res);
  }

  if (url.endsWith('/confirm') || action === 'confirm') {
    return await confirmHandler(req, res);
  }

  if (url.endsWith('/player') || action === 'player') {
    return await playerHandler(req, res);
  }

  return res.status(404).json({ error: 'Endpoint VIP não encontrado' });
};
