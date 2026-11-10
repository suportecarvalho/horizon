const { getSessionUser, isAdmin } = require('./_auth');
const {
  getAllOrders,
  getOrder,
  saveOrder,
  retryDelivery,
  manualApproveOrder,
  markOrderGranted,
  cancelOrder,
  createManualOrder,
  deleteOrder,
  clearAllOrders,
  isOrderDeleted
} = require('./_orders');
const { searchRecentPayments } = require('./_mercadopago');
const { attachResHelpers } = require('./_res');

const MASTER_KEYS = [
  process.env.ADMIN_SECRET,
  process.env.ADMIN_KEY,
  'horizon2026admin',
  'horizon_adm'
].filter(Boolean);

function checkAdminAuth(req) {
  // 1. Verifica sessão Steam autenticada
  const user = getSessionUser(req);
  if (user && (user.isAdmin || isAdmin(user.steamId || user.steamid))) {
    return { authorized: true, user };
  }

  // 2. Verifica chave mestra via Header ou Query
  const keyHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  const keyParam = req.query && (req.query.admin_key || req.query.key);
  const provided = (keyHeader ? keyHeader.replace(/^Bearer\s+/i, '') : '') || keyParam || '';

  if (provided && MASTER_KEYS.includes(provided)) {
    return {
      authorized: true,
      user: {
        steamId: '76561198737554294',
        name: 'Administrador (Chave Mestra)',
        avatar: 'https://avatars.fastly.steamstatic.com/c5ff599f01c1c6496dbb96cc4321283e0b2cd8fd_full.jpg',
        isAdmin: true
      }
    };
  }

  return { authorized: false, user: null };
}

function formatPtBrDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

function formatTierName(tier) {
  if (!tier) return 'VIP Bronze';
  const t = String(tier).toLowerCase().trim();
  const map = {
    'sobrevivente': 'VIP Bronze',
    'bronze': 'VIP Bronze',
    'prata': 'VIP Prata',
    'ouro': 'VIP Ouro',
    'farmer': 'Kit Farmer',
    'airdrop': 'Kit Airdrop',
    'cartao': 'Kit Cartões',
    'cartoes': 'Kit Cartões',
    'eletrica': 'Kit Elétrica'
  };
  return map[t] || `VIP ${t.toUpperCase()}`;
}

module.exports = async (req, res) => {
  attachResHelpers(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, X-Admin-Key');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { authorized, user } = checkAdminAuth(req);
  if (!authorized) {
    return res.status(401).json({
      success: false,
      error: 'Acesso restrito. Faça login com uma conta Steam de Administrador ou forneça a chave mestra de segurança.'
    });
  }

  // ==========================================
  // GET: Lista de pedidos e métricas do painel
  // ==========================================
  if (req.method === 'GET') {
    try {
      let orders = await getAllOrders();

      // Sincroniza pagamentos recentes do Mercado Pago para não perder nenhum pagamento
      try {
        const recent = await searchRecentPayments(30);
        if (Array.isArray(recent)) {
          for (const p of recent) {
            if (p && p.status === 'approved' && p.metadata && p.metadata.steam_id) {
              const meta = p.metadata;
              const orderId = meta.order_id || `MP-${p.id}`;

              const isDeleted = (await isOrderDeleted(orderId)) || (await isOrderDeleted(String(p.id)));
              if (isDeleted) continue;

              const exists = orders.find(o => o.id === orderId || String(o.payment_id) === String(p.id));
              if (!exists) {
                const approvedAt = p.date_approved || new Date().toISOString();
                const expiresAt = new Date(new Date(approvedAt).getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString();
                const newO = {
                  id: orderId,
                  payment_id: String(p.id),
                  steam_id: String(meta.steam_id),
                  player_name: meta.player_name || 'Jogador',
                  vip_tier: meta.vip_tier || 'bronze',
                  amount: Number(p.transaction_amount || 0),
                  status: 'approved',
                  granted: false,
                  created_at: p.date_created || approvedAt,
                  approved_at: approvedAt,
                  expires_at: expiresAt,
                  payment_method: p.payment_method_id || 'pix'
                };
                await saveOrder(newO);
                orders.unshift(newO);
              }
            }
          }
        }
      } catch (eMp) {}

      // Calcula métricas
      let totalRevenue = 0;
      let approvedCount = 0;
      let pendingDeliveryCount = 0;
      let pendingPaymentCount = 0;

      const formattedOrders = orders.map(o => {
        const amt = Number(o.amount || 0);
        const isApproved = o.status === 'approved';
        const isGranted = !!o.granted;

        if (isApproved) {
          totalRevenue += amt;
          approvedCount++;
          if (!isGranted) {
            pendingDeliveryCount++;
          }
        } else if (o.status === 'pending') {
          pendingPaymentCount++;
        }

        const sid = String(o.steam_id || '');
        const tier = o.vip_tier || 'bronze';

        return {
          id: o.id,
          paymentId: o.payment_id || '-',
          steamId: sid,
          playerName: o.player_name || 'Jogador',
          playerAvatar: o.player_avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          vipTier: tier,
          vipTierFormatted: formatTierName(tier),
          amount: amt,
          amountFormatted: `R$ ${amt.toFixed(2).replace('.', ',')}`,
          status: o.status || 'pending',
          granted: isGranted,
          grantedAt: o.granted_at ? formatPtBrDate(o.granted_at) : null,
          createdAt: formatPtBrDate(o.created_at),
          createdAtIso: o.created_at,
          approvedAt: formatPtBrDate(o.approved_at),
          expiresAt: formatPtBrDate(o.expires_at),
          paymentMethod: (o.payment_method || 'pix').toUpperCase(),
          deliveryCommand: `horizon.grantvip ${sid} ${tier} 30`,
          steamProfileUrl: sid ? `https://steamcommunity.com/profiles/${sid}` : null,
          steamChatUrl: sid ? `steam://friends/message/${sid}` : null,
          adminNotes: o.admin_notes || ''
        };
      });

      return res.status(200).json({
        success: true,
        admin: {
          name: user.name,
          steamId: user.steamId || user.steamid,
          avatar: user.avatar
        },
        metrics: {
          totalOrders: formattedOrders.length,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalRevenueFormatted: `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`,
          approvedCount,
          pendingDeliveryCount,
          pendingPaymentCount
        },
        orders: formattedOrders
      });
    } catch (err) {
      console.error('[Admin Orders Error]:', err);
      return res.status(500).json({ error: 'Erro ao carregar pedidos', details: err.message });
    }
  }

  // ==========================================
  // POST: Ações administrativas sobre pedidos
  // ==========================================
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      body = body || {};

      const { action, orderId } = body;

      if (!action) {
        return res.status(400).json({ error: 'Ação não informada' });
      }

      // Ação 1: Forçar re-entrega no jogo
      if (action === 'retry_delivery' || action === 'regrant') {
        if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
        const updated = await retryDelivery(orderId);
        if (!updated) return res.status(404).json({ error: 'Pedido não encontrado' });
        return res.status(200).json({
          success: true,
          message: `Pedido ${orderId} marcado como pendente de entrega. O servidor de Rust irá entregar automaticamente em até 15 segundos!`,
          order: updated
        });
      }

      // Ação 2: Aprovação Manual
      if (action === 'manual_approve') {
        if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
        const updated = await manualApproveOrder(orderId);
        return res.status(200).json({
          success: true,
          message: `Pedido ${orderId} aprovado com sucesso! O VIP já está pronto para entrega automática no jogo.`,
          order: updated
        });
      }

      // Ação 3: Marcar como entregue
      if (action === 'mark_granted') {
        if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
        await markOrderGranted(orderId);
        return res.status(200).json({
          success: true,
          message: `Pedido ${orderId} confirmado como entregue no servidor.`
        });
      }

      // Ação 4: Cancelar pedido
      if (action === 'cancel') {
        if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
        const updated = await cancelOrder(orderId);
        return res.status(200).json({
          success: true,
          message: `Pedido ${orderId} foi cancelado com sucesso.`,
          order: updated
        });
      }

      // Ação 5: Criar entrega manual para jogador
      if (action === 'create_manual') {
        const { steamId, playerName, vipTier, durationDays, amount, adminNotes } = body;
        if (!steamId) return res.status(400).json({ error: 'SteamID obrigatório' });

        const newOrder = await createManualOrder({
          steamId,
          playerName,
          vipTier: vipTier || 'bronze',
          durationDays: durationDays || 30,
          amount: amount || 0,
          adminNotes: adminNotes || 'Entrega manual via Painel Admin'
        });

        return res.status(200).json({
          success: true,
          message: `VIP ${vipTier.toUpperCase()} criado com sucesso para o jogador ${steamId}! Entrega agendada no servidor.`,
          order: newOrder
        });
      }

      // Ação 6: Excluir um pagamento individual
      if (action === 'delete_order') {
        if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
        await deleteOrder(orderId);
        return res.status(200).json({
          success: true,
          message: `Pagamento ${orderId} foi excluído com sucesso do banco de dados.`
        });
      }

      // Ação 7: Excluir pagamentos em lote / geral
      if (action === 'delete_all_orders' || action === 'clear_all_orders') {
        const filterType = body.filter || 'all'; // 'all' ou 'pending'
        await clearAllOrders(filterType);
        const msg = filterType === 'pending'
          ? 'Todos os pagamentos pendentes/não pagos foram excluídos com sucesso!'
          : 'Todos os pagamentos foram excluídos com sucesso do banco de dados!';
        return res.status(200).json({
          success: true,
          message: msg
        });
      }

      return res.status(400).json({ error: `Ação '${action}' desconhecida` });
    } catch (err) {
      console.error('[Admin Action Error]:', err);
      return res.status(500).json({ error: 'Erro ao executar ação administrativa', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
