const { attachResHelpers } = require('./_res');
const steamHandler = require('./_auth_routes/steam');
const returnHandler = require('./_auth_routes/return');
const logoutHandler = require('./_auth_routes/logout');
const demoAdminHandler = require('./_auth_routes/demo-admin');
const demoLoginHandler = require('./_auth_routes/demo-login');

module.exports = async (req, res) => {
  if (attachResHelpers) attachResHelpers(req, res);

  const url = (req.url || '').split('?')[0].replace(/\/+$/, '');
  const action = (req.query && req.query.action) ? String(req.query.action).toLowerCase() : '';

  if (action === 'steam' || url.endsWith('/steam')) {
    return await steamHandler(req, res);
  }

  if (action === 'return' || url.endsWith('/return') || url.endsWith('/steam/return')) {
    return await returnHandler(req, res);
  }

  if (action === 'logout' || url.endsWith('/logout')) {
    return await logoutHandler(req, res);
  }

  if (action === 'demo-admin' || url.endsWith('/demo-admin')) {
    return await demoAdminHandler(req, res);
  }

  if (action === 'demo-login' || url.endsWith('/demo-login')) {
    return await demoLoginHandler(req, res);
  }

  return res.status(404).json({ error: 'Endpoint de autenticação não encontrado' });
};
