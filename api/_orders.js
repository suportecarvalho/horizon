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

/**
 * Cria ou atualiza um pedido no banco
 */
async function saveOrder(order) {
  // Salva no Supabase se disponível
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('vip_orders')
        .upsert([{
          id: order.id,
          payment_id: String(order.payment_id || order.id),
          steam_id: String(order.steam_id),
          player_name: order.player_name || '',
          player_avatar: order.player_avatar || '',
          vip_tier: order.vip_tier,
          amount: Number(order.amount),
          status: order.status || 'pending',
          granted: !!order.granted,
          created_at: order.created_at || new Date().toISOString(),
          approved_at: order.approved_at || null,
          expires_at: order.expires_at || null,
          payment_method: order.payment_method || 'pix',
          raw_data: order.raw_data || null
        }], { onConflict: 'id' });

      if (!error) {
        // Também mantém cópia local
        const orders = loadLocalOrders();
        const idx = orders.findIndex(o => o.id === order.id);
        if (idx >= 0) orders[idx] = order;
        else orders.unshift(order);
        saveLocalOrders(orders);
        return order;
      }
    } catch (e) {
      console.warn('[Orders Supabase] Erro ao salvar pedido:', e.message);
    }
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
  }

  const orders = loadLocalOrders();
  return orders.find(o => String(o.id) === queryId || String(o.payment_id) === queryId) || null;
}

/**
 * Aprova o pagamento e calcula os 30 dias de validade
 */
async function approveOrder(idOrPaymentId, paymentDetails = {}) {
  const order = await getOrder(idOrPaymentId);
  if (!order) return null;

  const now = new Date();
  const expires = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 dias exatos

  order.status = 'approved';
  order.approved_at = now.toISOString();
  order.expires_at = expires.toISOString();
  order.granted = false; // Pronto para o servidor entregar
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
  }

  const orders = loadLocalOrders();
  return orders.filter(o => o.status === 'approved' && !o.granted);
}

/**
 * Marca uma entrega como concluída pelo servidor de Rust
 */
async function markOrderGranted(orderId) {
  const order = await getOrder(orderId);
  if (!order) return false;

  order.granted = true;
  order.granted_at = new Date().toISOString();
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

module.exports = {
  saveOrder,
  getOrder,
  approveOrder,
  getPendingDeliveries,
  markOrderGranted,
  getActiveVipForPlayer,
  loadLocalOrders
};
