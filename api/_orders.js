const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwgswqwqwrnpmcirajre.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Z3N3cXdxd3JucG1jaXJhanJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mzc0NzgxMiwiZXhwIjoyMTA5MzIzODEyfQ.GPb3PY0kWwQZwfSVo4wp6QC_3ee-cW0_OYiTkZVIW4U';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
  } catch (e) {}
}

const DATA_FILE = path.join(process.cwd(), 'data', 'orders.json');
const TMP_FILE = '/tmp/orders.json';
let memoryOrders = null;

function loadLocalOrders() {
  if (memoryOrders) return memoryOrders;
  try {
    if (fs.existsSync(TMP_FILE)) {
      return (memoryOrders = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8')));
    }
  } catch (e) {}
  try {
    if (fs.existsSync(DATA_FILE)) {
      return (memoryOrders = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')));
    }
  } catch (e) {}
  memoryOrders = [];
  return memoryOrders;
}

function saveLocalOrders(orders) {
  memoryOrders = orders;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (e) {}
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (e) {}
}

async function getSystemOrdersFromSupabase() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('feed_posts')
      .select('caption')
      .eq('id', '__horizon_vip_orders_db__')
      .maybeSingle();
    if (data && data.caption) {
      const parsed = JSON.parse(data.caption);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

async function saveSystemOrdersToSupabase(orders) {
  if (!supabase || !Array.isArray(orders)) return;
  try {
    await supabase.from('feed_posts').upsert([{
      id: '__horizon_vip_orders_db__',
      author_steamid: '0',
      author_name: 'System Orders DB',
      author_avatar: '',
      image_url: 'https://files.facepunch.com/rust/item/vip.png',
      caption: JSON.stringify(orders),
      tag: '__system__'
    }], { onConflict: 'id' });
  } catch (e) {}
}

/**
 * Cria ou atualiza um pedido no banco
 */
async function saveOrder(order) {
  // Salva no Supabase se disponível (tenta tabela vip_orders)
  if (supabase) {
    try {
      await supabase
        .from('vip_orders')
        .upsert([{
          id: order.id,
          payment_id: String(order.payment_id || order.id),
          steam_id: String(order.steam_id || ''),
          player_name: order.player_name || '',
          player_avatar: order.player_avatar || '',
          vip_tier: order.vip_tier || 'bronze',
          amount: Number(order.amount || 0),
          status: order.status || 'pending',
          granted: !!order.granted,
          created_at: order.created_at || new Date().toISOString(),
          approved_at: order.approved_at || null,
          expires_at: order.expires_at || null,
          payment_method: order.payment_method || 'pix',
          raw_data: order.raw_data || null
        }], { onConflict: 'id' });
    } catch (e) {}

    // Sempre sincroniza com a linha persistente do sistema no Supabase
    try {
      const sysOrders = await getSystemOrdersFromSupabase();
      const idx = sysOrders.findIndex(o => o.id === order.id || String(o.payment_id) === String(order.payment_id || order.id));
      if (idx >= 0) sysOrders[idx] = { ...sysOrders[idx], ...order };
      else sysOrders.unshift(order);
      await saveSystemOrdersToSupabase(sysOrders);
    } catch (e) {}
  }

  // Fallback Local
  const orders = loadLocalOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = { ...orders[idx], ...order };
  } else {
    orders.unshift(order);
  }
  saveLocalOrders(orders);
  return order;
}

/**
 * Busca pedido por ID do pedido ou ID do pagamento Mercado Pago
 */
async function getOrder(idOrPaymentId) {
  if (!idOrPaymentId) return null;
  const queryId = String(idOrPaymentId);

  if (supabase) {
    try {
      const { data } = await supabase
        .from('vip_orders')
        .select('*')
        .or(`id.eq.${queryId},payment_id.eq.${queryId}`)
        .maybeSingle();

      if (data) return data;
    } catch (e) {}

    try {
      const sysOrders = await getSystemOrdersFromSupabase();
      const found = sysOrders.find(o => String(o.id) === queryId || String(o.payment_id) === queryId);
      if (found) return found;
    } catch (e) {}
  }

  const orders = loadLocalOrders();
  return orders.find(o => String(o.id) === queryId || String(o.payment_id) === queryId) || null;
}

/**
 * Aprova o pagamento e calcula os 30 dias de validade
 */
async function approveOrder(idOrPaymentId, paymentDetails = {}) {
  let order = await getOrder(idOrPaymentId);
  const now = new Date();
  const expires = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 dias exatos

  if (!order) {
    order = {
      id: String(idOrPaymentId),
      status: 'approved',
      approved_at: now.toISOString(),
      expires_at: expires.toISOString(),
      granted: false
    };
  } else {
    order.status = 'approved';
    order.approved_at = now.toISOString();
    order.expires_at = expires.toISOString();
    order.granted = false; // Pronto para o servidor entregar
  }

  if (paymentDetails.payment_id) order.payment_id = String(paymentDetails.payment_id);
  if (paymentDetails.raw_data) order.raw_data = paymentDetails.raw_data;

  return await saveOrder(order);
}

/**
 * Busca pedidos aprovados que ainda não foram entregues pelo servidor de Rust
 */
async function getPendingDeliveries() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('vip_orders')
        .select('*')
        .eq('status', 'approved')
        .eq('granted', false)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) return data;
    } catch (e) {}

    try {
      const sysOrders = await getSystemOrdersFromSupabase();
      return sysOrders.filter(o => o.status === 'approved' && !o.granted);
    } catch (e) {}
  }

  const orders = loadLocalOrders();
  return orders.filter(o => o.status === 'approved' && !o.granted);
}

/**
 * Marca uma entrega como concluída pelo servidor de Rust
 */
async function markOrderGranted(orderId) {
  if (!orderId) return false;
  const now = new Date().toISOString();

  // Tratamento para entregas de itens individuais do carrinho
  if (orderId.includes('__')) {
    const [parentOrderId, subKey] = orderId.split('__');
    let parentOrder = await getOrder(parentOrderId);
    if (parentOrder) {
      parentOrder.granted_items = Array.isArray(parentOrder.granted_items) ? parentOrder.granted_items : [];
      if (!parentOrder.granted_items.includes(subKey)) {
        parentOrder.granted_items.push(subKey);
      }
      const rawData = (typeof parentOrder.raw_data === 'string') 
        ? (() => { try { return JSON.parse(parentOrder.raw_data); } catch (e) { return {}; } })() 
        : (parentOrder.raw_data || {});
      const itemsList = Array.isArray(rawData.items) 
        ? rawData.items 
        : (parentOrder.vip_tier && parentOrder.vip_tier.includes(',') 
            ? parentOrder.vip_tier.split(',') 
            : (Array.isArray(parentOrder.items) ? parentOrder.items : [parentOrder.vip_tier || 'bronze']));
      const totalItems = itemsList.length;
      if (parentOrder.granted_items.length >= totalItems) {
        parentOrder.granted = true;
        parentOrder.granted_at = now;
      }
      await saveOrder(parentOrder);
    }
    // Salva o registro da sub-entrega para idempotência
    await saveOrder({
      id: String(orderId),
      parent_order_id: parentOrderId,
      status: 'approved',
      granted: true,
      granted_at: now
    });
    return true;
  }

  let order = await getOrder(orderId);
  if (!order) {
    order = {
      id: String(orderId),
      status: 'approved',
      granted: true,
      granted_at: now
    };
  } else {
    order.granted = true;
    order.granted_at = now;
  }

  await saveOrder(order);
  return true;
}

/**
 * Retorna os VIPs ativos de um jogador específico (SteamID64)
 */
async function getActiveVipForPlayer(steamId) {
  const sid = String(steamId);
  const now = new Date().toISOString();

  if (supabase) {
    try {
      const { data } = await supabase
        .from('vip_orders')
        .select('*')
        .eq('steam_id', sid)
        .eq('status', 'approved')
        .gt('expires_at', now)
        .order('expires_at', { ascending: false });

      if (data && data.length > 0) return data[0];
    } catch (e) {}
  }

  const orders = loadLocalOrders();
  const active = orders
    .filter(o => String(o.steam_id) === sid && o.status === 'approved' && o.expires_at && o.expires_at > now)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));

  return active[0] || null;
}


/**
 * Retorna todos os pedidos para o painel administrativo (ordenados do mais recente ao mais antigo)
 */
async function getAllOrders() {
  let orders = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('vip_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        orders = data;
      }
    } catch (e) {}

    if (orders.length === 0) {
      try {
        const sys = await getSystemOrdersFromSupabase();
        if (Array.isArray(sys) && sys.length > 0) {
          orders = sys;
        }
      } catch (e) {}
    }
  }

  const local = loadLocalOrders();
  if (orders.length === 0) {
    orders = local;
  } else if (local.length > 0) {
    const map = new Map();
    orders.forEach(o => { if (o && o.id) map.set(o.id, o); });
    local.forEach(o => {
      if (o && o.id && !map.has(o.id)) map.set(o.id, o);
    });
    orders = Array.from(map.values());
  }

  // Filtra sub-entregas duplicadas que não são pedidos principais
  orders = orders.filter(o => o && o.id && !o.id.includes('__'));

  orders.sort((a, b) => new Date(b.created_at || b.approved_at || 0) - new Date(a.created_at || a.approved_at || 0));
  return orders;
}

/**
 * Força re-entrega no jogo (marca como não entregue para o servidor Rust puxar via /api/vip/pending)
 */
async function retryDelivery(orderId) {
  const order = await getOrder(orderId);
  if (!order) return null;

  order.granted = false;
  order.granted_items = [];
  delete order.granted_at;

  await saveOrder(order);
  return order;
}

/**
 * Aprova manualmente um pedido (ex: pagamento confirmado por fora ou falha no webhook)
 */
async function manualApproveOrder(orderId) {
  let order = await getOrder(orderId);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();

  if (!order) {
    order = {
      id: orderId,
      status: 'approved',
      granted: false,
      approved_at: now,
      expires_at: expiresAt
    };
  } else {
    order.status = 'approved';
    order.granted = false;
    order.approved_at = now;
    order.expires_at = expiresAt;
  }

  await saveOrder(order);
  return order;
}

/**
 * Cancela um pedido
 */
async function cancelOrder(orderId) {
  const order = await getOrder(orderId);
  if (!order) return null;

  order.status = 'cancelled';
  await saveOrder(order);
  return order;
}

/**
 * Cria um pedido manual de entrega VIP
 */
async function createManualOrder({ steamId, playerName, playerAvatar, vipTier, durationDays = 30, amount = 0, adminNotes = '' }) {
  const now = new Date().toISOString();
  const days = Number(durationDays) || 30;
  const expiresAt = new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
  const id = `HORIZON-MANUAL-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const order = {
    id,
    payment_id: `MANUAL-${Date.now()}`,
    steam_id: String(steamId).trim(),
    player_name: playerName || 'Jogador',
    player_avatar: playerAvatar || '',
    vip_tier: String(vipTier || 'bronze').toLowerCase().trim(),
    amount: Number(amount) || 0,
    status: 'approved',
    granted: false,
    created_at: now,
    approved_at: now,
    expires_at: expiresAt,
    payment_method: 'manual_admin',
    admin_notes: adminNotes
  };

  await saveOrder(order);
  return order;
}

module.exports = {
  saveOrder,
  getOrder,
  approveOrder,
  getPendingDeliveries,
  markOrderGranted,
  getActiveVipForPlayer,
  loadLocalOrders,
  getAllOrders,
  retryDelivery,
  manualApproveOrder,
  cancelOrder,
  createManualOrder
};
