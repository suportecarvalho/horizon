const { attachResHelpers } = require('../_res');

const VALID_COUPONS = {
  'HORIZON10': { percent: 10, label: '10% de desconto de boas-vindas' },
  'HORIZON20': { percent: 20, label: '20% de desconto especial' },
  'WIPE': { percent: 10, label: '10% de desconto Wipe Especial' },
  'TERRAHOSTIL': { percent: 15, label: '15% de desconto Terra Hostil' }
};

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const code = String(req.query.code || (req.body && req.body.code) || '').toUpperCase().trim();

  if (!code) {
    return res.status(400).json({ valid: false, error: 'Código de cupom não informado' });
  }

  const coupon = VALID_COUPONS[code];
  if (!coupon) {
    return res.status(404).json({ valid: false, error: 'Cupom inválido ou expirado' });
  }

  return res.status(200).json({
    valid: true,
    code,
    percent: coupon.percent,
    label: coupon.label
  });
};
