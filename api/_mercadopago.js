const https = require('https');
const fs = require('fs');
const path = require('path');
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (e) {}

function getMPConfig() {
  let config = {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || '',
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET || '',
    notificationUrl: process.env.MERCADO_PAGO_NOTIFICATION_URL || '',
    durationDays: 30,
    kits: {
      bronze: { name: "VIP Bronze (30 Dias)", price: 20.00, group: "vip_bronze", kitPermission: "kits.vipbronze" },
      prata: { name: "VIP Prata (30 Dias)", price: 40.00, group: "vip_prata", kitPermission: "kits.vipprata" },
      ouro: { name: "VIP Ouro (30 Dias)", price: 60.00, group: "vip_ouro", kitPermission: "kits.vipouro" },
      farmer: { name: "Kit Farmer", price: 10.00, group: "kit_farmer", kitPermission: "kits.farmer" },
      airdrop: { name: "Kit Airdrop", price: 10.00, group: "kit_drop", kitPermission: "kits.drop" },
      cartao: { name: "Kit Cartões", price: 10.00, group: "kit_cartao", kitPermission: "kits.cartao" }
    }
  };

  const configPath = path.join(process.cwd(), 'config', 'mercadopago.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = { ...config, ...fileData };
    } catch (e) {}
  }

  // Se accessToken não veio de JSON, tenta ler de .env
  if (!config.accessToken && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    config.accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  }

  return config;
}

function requestMP(endpoint, method, body, token) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const url = new URL(`https://api.mercadopago.com${endpoint}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `horizon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ statusCode: res.statusCode, error: parsed });
          }
        } catch (e) {
          reject({ statusCode: res.statusCode, error: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Timeout ao conectar com Mercado Pago'));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Cria cobrança PIX via Mercado Pago API
 */
async function createPixPayment({ orderId, amount, description, payerEmail, payerName, steamId, vipTier, baseUrl }) {
  const config = getMPConfig();
  const token = config.accessToken;

  // Se o token do Mercado Pago ainda não foi configurado pelo usuário,
  // gera um Pix simulado de demonstração para que a loja funcione e teste imediatamente
  if (!token || token.includes('SEU_ACCESS_TOKEN') || token.trim() === '') {
    console.warn('[MercadoPago] ATENÇÃO: MERCADO_PAGO_ACCESS_TOKEN não configurado em config/mercadopago.json. Gerando cobrança simulada para testes.');
    const mockCode = `00020101021226840014br.gov.bcb.pix2562horizon-rust-${orderId}520400005303986540${amount.toFixed(2)}5802BR5914RUST_HORIZON6009SAO_PAULO62070503***6304ABCD`;
    let qrDataUrl = '';
    if (QRCode) {
      try {
        qrDataUrl = await QRCode.toDataURL(mockCode, { margin: 1, width: 240 });
      } catch (e) {}
    }
    const base64Pure = qrDataUrl ? qrDataUrl.replace(/^data:image\/png;base64,/, '') : '';

    return {
      id: `sim-${Date.now()}`,
      status: 'pending',
      status_detail: 'waiting_payment',
      payment_method_id: 'pix',
      transaction_amount: amount,
      point_of_interaction: {
        transaction_data: {
          qr_code: mockCode,
          qr_code_base64: base64Pure,
          ticket_url: `https://www.mercadopago.com.br/payments/test-${orderId}`
        }
      },
      is_mock: true
    };
  }

  let notificationUrl = config.notificationUrl;
  if (!notificationUrl || notificationUrl.includes('localhost') || !notificationUrl.startsWith('https://')) {
    if (baseUrl && baseUrl.startsWith('https://') && !baseUrl.includes('localhost')) {
      notificationUrl = `${baseUrl}/api/checkout/webhook`;
    } else {
      notificationUrl = 'https://lojahorizon.vercel.app/api/checkout/webhook';
    }
  }

  const payload = {
    transaction_amount: Number(amount),
    description: description || `VIP ${vipTier.toUpperCase()} - Rust Horizon`,
    payment_method_id: 'pix',
    payer: {
      email: payerEmail || `jogador_${steamId}@rusthorizon.com`,
      first_name: payerName ? payerName.split(' ')[0] : 'Jogador',
      last_name: payerName && payerName.split(' ').length > 1 ? payerName.split(' ').slice(1).join(' ') : 'Horizon'
    },
    notification_url: notificationUrl,
    metadata: {
      order_id: orderId,
      steam_id: String(steamId),
      vip_tier: vipTier,
      server: "Horizon 2x (Max 4)"
    }
  };

  const resp = await requestMP('/v1/payments', 'POST', payload, token);
  if (resp && resp.point_of_interaction && resp.point_of_interaction.transaction_data) {
    const td = resp.point_of_interaction.transaction_data;
    if ((!td.qr_code_base64 || td.qr_code_base64.length < 50) && td.qr_code && QRCode) {
      try {
        const qrUrl = await QRCode.toDataURL(td.qr_code, { margin: 1, width: 240 });
        td.qr_code_base64 = qrUrl.replace(/^data:image\/png;base64,/, '');
      } catch (e) {}
    }
  }
  return resp;
}

/**
 * Cria Checkout Pro (Cartão de crédito, Boleto e PIX via página Mercado Pago)
 */
async function createPreference({ orderId, amount, description, payerEmail, steamId, vipTier, baseUrl }) {
  const config = getMPConfig();
  const token = config.accessToken;

  if (!token || token.trim() === '') {
    return {
      id: `pref-sim-${Date.now()}`,
      init_point: `${baseUrl}/loja/?test_order=${orderId}`,
      is_mock: true
    };
  }

  let notificationUrl = config.notificationUrl;
  if (!notificationUrl || notificationUrl.includes('localhost') || !notificationUrl.startsWith('https://')) {
    if (baseUrl && baseUrl.startsWith('https://') && !baseUrl.includes('localhost')) {
      notificationUrl = `${baseUrl}/api/checkout/webhook`;
    } else {
      notificationUrl = 'https://lojahorizon.vercel.app/api/checkout/webhook';
    }
  }

  const payload = {
    items: [
      {
        id: vipTier,
        title: description,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(amount)
      }
    ],
    payer: {
      email: payerEmail || `jogador_${steamId}@rusthorizon.com`
    },
    back_urls: {
      success: `${baseUrl}/loja/?status=success&orderId=${orderId}`,
      pending: `${baseUrl}/loja/?status=pending&orderId=${orderId}`,
      failure: `${baseUrl}/loja/?status=failure&orderId=${orderId}`
    },
    auto_return: 'approved',
    notification_url: notificationUrl,
    external_reference: orderId,
    metadata: {
      order_id: orderId,
      steam_id: String(steamId),
      vip_tier: vipTier
    }
  };

  return await requestMP('/checkout/preferences', 'POST', payload, token);
}

/**
 * Consulta status de um pagamento pelo ID no Mercado Pago
 */
async function getPayment(paymentId) {
  const config = getMPConfig();
  const token = config.accessToken;

  if (!token || String(paymentId).startsWith('sim-')) {
    return null;
  }

  return await requestMP(`/v1/payments/${paymentId}`, 'GET', null, token);
}

/**
 * Busca pagamentos recentes na API do Mercado Pago
 */
async function searchRecentPayments(limit = 20) {
  const config = getMPConfig();
  const token = config.accessToken;
  if (!token) return [];

  try {
    const res = await requestMP(`/v1/payments/search?sort=date_created&criteria=desc&limit=${limit}`, 'GET', null, token);
    return res && Array.isArray(res.results) ? res.results : [];
  } catch (e) {
    console.error('[MercadoPago searchRecentPayments]:', e.message);
    return [];
  }
}

module.exports = {
  getMPConfig,
  createPixPayment,
  createPreference,
  getPayment,
  searchRecentPayments
};
