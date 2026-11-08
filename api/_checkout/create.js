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
  let host = req.headers['x-forwarded-host'] || req.headers.host || 'lojahorizon.vercel.app';
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
    let tier = (vipTier || 'bronze').toLowerCase().trim();
    if (tier === 'kit-farmer' || tier === 'kit_farmer') tier = 'farmer';
    if (tier === 'kit-airdrop' || tier === 'kit_airdrop' || tier === 'drop' || tier === 'kit-drop') tier = 'airdrop';
    if (tier === 'kit-cartao' || tier === 'kit_cartao' || tier === 'cards' || tier === 'cartoes') tier = 'cartao';
    if (tier === 'kit-eletrica' || tier === 'kit_eletrica' || tier === 'eletrico') tier = 'eletrica';
    const kit = config.kits[tier];

    if (!kit) {
      return res.status(400).json({ error: `Plano ou Kit inválido: ${vipTier}. Escolha bronze, prata, ouro, farmer, airdrop, cartao ou eletrica.` });
    }

    // Busca detalhes do jogador no Steam se não vier da sessão
    let playerName = sessionUser ? sessionUser.name : (payerName || '');
    let playerAvatar = sessionUser ? sessionUser.avatar : '';

    if (!playerName || !playerAvatar) {
      const steamInfo = await fetchSteamProfile(steamId);
      if (!playerName) playerName = steamInfo.name;
      if (!playerAvatar) playerAvatar = steamInfo.avatar;
    }

    const orderId = `HORIZON-${tier.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const baseUrl = getBaseUrl(req);

    // Cria cobrança PIX no Mercado Pago
    let pixData = null;
    let preferenceData = null;
    let mpPaymentId = null;

    try {
      pixData = await createPixPayment({
        orderId,
        amount: kit.price,
        description: `${kit.name} - Rust Horizon (30 Dias)`,
        payerEmail: email || `jogador_${steamId}@rusthorizon.com`,
        payerName: playerName,
        steamId,
        vipTier: tier,
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
        amount: kit.price,
        description: `${kit.name} - Rust Horizon (30 Dias)`,
        payerEmail: email || `jogador_${steamId}@rusthorizon.com`,
        steamId,
        vipTier: tier,
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
      vip_tier: tier,
      amount: kit.price,
      status: 'pending',
      granted: false,
      created_at: new Date().toISOString(),
      expires_at: null, // Será preenchido ao aprovar (+30 dias)
      raw_data: {
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
      amount: kit.price,
      vipTier: tier,
      vipName: kit.name,
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
