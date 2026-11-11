const { saveOrder } = require('../_orders');
const { getMPConfig, createPixPayment, createPreference } = require('../_mercadopago');
const { getSessionUser } = require('../_auth');
const { attachResHelpers } = require('../_res');
const https = require('https');

// Busca nome e avatar na Steam caso não informados
function fetchSteamProfile(steamId64) {
  const accountId = (BigInt(steamId64) - 76561197960265728n).toString();
  const url = `https://steamcommunity.com/miniprofile/${accountId}/json/`;

  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({
            name: parsed.persona_name || 'Jogador',
            avatar: parsed.avatar_url || ''
          });
        } catch {
          resolve({ name: 'Jogador', avatar: '' });
        }
      });
    });
    req.on('error', () => resolve({ name: 'Jogador', avatar: '' }));
    req.setTimeout(4000, () => { req.destroy(); resolve({ name: 'Jogador', avatar: '' }); });
  });
}

function getBaseUrl(req) {
  let proto = req.headers['x-forwarded-proto'] || 'https';
  if (proto.includes(',')) proto = proto.split(',')[0].trim();
  let host = req.headers['x-forwarded-host'] || req.headers.host || 'www.rusthorizon.shop';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    const { vipTier, email, payerName } = body;
    let steamId = body.steamId;

    // Se o usuário estiver autenticado na sessão do site, usa o SteamID dele
    const sessionUser = getSessionUser(req);
    if (!steamId && sessionUser) {
      steamId = sessionUser.steamId || sessionUser.steamid;
    }

    // Se o usuário passou um link da Steam, extrai o SteamID
    if (steamId && typeof steamId === 'string') {
      steamId = steamId.trim();
      const match = steamId.match(/7656119\d{10}/);
      if (match) steamId = match[0];
    }

    if (!steamId || !/^\d{17}$/.test(String(steamId))) {
      return res.status(400).json({
        error: 'SteamID64 inválido. Forneça o SteamID numérico de 17 dígitos (ex: 76561198012345678).'
      });
    }

    const config = getMPConfig();

    // Normalização dos itens recebidos (suporta item único via vipTier ou múltiplos itens via items/cart)
    function normalizeTier(t) {
      let tier = String(t || '').toLowerCase().trim();
      if (tier === 'kit-farmer' || tier === 'kit_farmer') tier = 'farmer';
      if (tier === 'kit-airdrop' || tier === 'kit_airdrop' || tier === 'drop' || tier === 'kit-drop') tier = 'airdrop';
      if (tier === 'kit-cartao' || tier === 'kit_cartao' || tier === 'cards' || tier === 'cartoes') tier = 'cartao';
      if (tier === 'kit-eletrica' || tier === 'kit_eletrica' || tier === 'eletrico') tier = 'eletrica';
      return tier;
    }

    let rawItems = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      rawItems = body.items;
    } else if (Array.isArray(body.cart) && body.cart.length > 0) {
      rawItems = body.cart;
    } else if (body.vipTier) {
      rawItems = [body.vipTier];
    } else {
      rawItems = ['bronze'];
    }

    const validItems = [];
    for (const item of rawItems) {
      const tierKey = normalizeTier(typeof item === 'object' ? (item.tier || item.id) : item);
      const kitDef = config.kits[tierKey];
      if (!kitDef) {
        return res.status(400).json({ error: `Plano ou Kit inválido: ${tierKey}. Escolha bronze, prata, ouro, farmer, airdrop, cartao ou eletrica.` });
      }
      validItems.push({
        tier: tierKey,
        name: kitDef.name,
        price: Number(kitDef.price),
        group: kitDef.group,
        kitPermission: kitDef.kitPermission
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'Nenhum item selecionado para compra.' });
    }

    const totalAmount = validItems.reduce((acc, it) => acc + it.price, 0);

    // Validação de Cupom de Desconto
    const VALID_COUPONS = {
      'HORIZON10': { percent: 10, label: '10% de desconto' },
      'HORIZON20': { percent: 20, label: '20% de desconto' },
      'WIPE': { percent: 10, label: '10% de desconto Wipe Especial' },
      'TERRAHOSTIL': { percent: 15, label: '15% de desconto Terra Hostil' }
    };

    let appliedCoupon = null;
    let discountAmount = 0;
    let finalAmount = totalAmount;

    if (body.coupon && typeof body.coupon === 'string') {
      const code = body.coupon.toUpperCase().trim();
      if (VALID_COUPONS[code]) {
        appliedCoupon = code;
        discountAmount = Math.round(((totalAmount * VALID_COUPONS[code].percent) / 100) * 100) / 100;
        finalAmount = Math.max(1, Math.round((totalAmount - discountAmount) * 100) / 100);
      }
    }

    const isCart = validItems.length > 1;
    const tier = isCart ? 'carrinho' : validItems[0].tier;
    const vipName = isCart
      ? `Carrinho Horizon (${validItems.map(it => it.name.replace(' (30 Dias)', '')).join(' + ')})`
      : validItems[0].name;

    // Busca detalhes do jogador no Steam se não vier da sessão
    let playerName = sessionUser ? sessionUser.name : (payerName || '');
    let playerAvatar = sessionUser ? sessionUser.avatar : '';

    if (!playerName || !playerAvatar) {
      const steamInfo = await fetchSteamProfile(steamId);
      if (!playerName) playerName = steamInfo.name;
      if (!playerAvatar) playerAvatar = steamInfo.avatar;
    }

    const orderPrefix = isCart ? 'HORIZON-CART' : `HORIZON-${validItems[0].tier.toUpperCase()}`;
    const orderId = `${orderPrefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const baseUrl = getBaseUrl(req);

    // Cria cobrança PIX no Mercado Pago
    let pixData = null;
    let preferenceData = null;
    let mpPaymentId = null;

    try {
      pixData = await createPixPayment({
        orderId,
        amount: finalAmount,
        description: `${vipName} - Rust Horizon (30 Dias)`,
        payerEmail: email || `jogador_${steamId}@rusthorizon.com`,
        payerName: playerName,
        steamId,
        vipTier: validItems.map(it => it.tier).join(','),
        baseUrl
      });
      mpPaymentId = pixData ? pixData.id : null;
    } catch (mpErr) {
      console.error('[Checkout Create] Erro ao chamar Mercado Pago PIX:', mpErr);
      return res.status(500).json({
        error: 'Erro ao gerar pagamento no Mercado Pago. Verifique as credenciais ou tente novamente.',
        details: mpErr.error || mpErr.message
      });
    }

    // Cria também a preferência Checkout Pro (caso o comprador queira cartão de crédito)
    try {
      preferenceData = await createPreference({
        orderId,
        amount: finalAmount,
        description: `${vipName} - Rust Horizon (30 Dias)`,
        payerEmail: email || `jogador_${steamId}@rusthorizon.com`,
        steamId,
        vipTier: validItems.map(it => it.tier).join(','),
        baseUrl
      });
    } catch (e) {}

    // Salva o pedido inicial
    const newOrder = {
      id: orderId,
      payment_id: mpPaymentId ? String(mpPaymentId) : orderId,
      steam_id: String(steamId),
      player_name: playerName,
      player_avatar: playerAvatar,
      vip_tier: validItems.map(it => it.tier).join(','),
      vip_name: vipName,
      items: validItems.map(it => it.tier),
      amount: finalAmount,
      original_amount: totalAmount,
      discount_amount: discountAmount,
      coupon: appliedCoupon,
      status: 'pending',
      granted: false,
      granted_items: [],
      created_at: new Date().toISOString(),
      expires_at: null, // Será preenchido ao aprovar (+30 dias)
      raw_data: {
        items: validItems.map(it => it.tier),
        pix_copia_e_cola: pixData?.point_of_interaction?.transaction_data?.qr_code || '',
        ticket_url: pixData?.point_of_interaction?.transaction_data?.ticket_url || '',
        preference_url: preferenceData?.init_point || ''
      }
    };

    await saveOrder(newOrder);

    return res.status(200).json({
      success: true,
      orderId,
      paymentId: mpPaymentId,
      amount: totalAmount,
      vipTier: tier,
      vipName: vipName,
      items: validItems,
      isCart,
      player: {
        steamId,
        name: playerName,
        avatar: playerAvatar
      },
      pix: {
        copiaECola: pixData?.point_of_interaction?.transaction_data?.qr_code || '',
        qrCodeBase64: pixData?.point_of_interaction?.transaction_data?.qr_code_base64 || '',
        ticketUrl: pixData?.point_of_interaction?.transaction_data?.ticket_url || ''
      },
      checkoutUrl: preferenceData?.init_point || pixData?.point_of_interaction?.transaction_data?.ticket_url || '',
      isMock: !!pixData?.is_mock
    });

  } catch (err) {
    console.error('[Checkout Create Error]:', err);
    return res.status(500).json({ error: 'Erro interno ao criar pedido', details: err.message });
  }
};
