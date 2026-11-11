/**
 * Horizon Rust - Sistema de Checkout Mercado Pago com Carrinho de Compras e Entrega Automática VIP / Kits (30 Dias)
 */
(function () {
  'use strict';

  const KITS_INFO = {
    sobrevivente: {
      name: 'VIP BRONZE',
      price: 'R$ 14,90',
      numericPrice: 14.90,
      img: 'https://i.imgur.com/Fnji1lo.png',
      badgeColor: '#CD7F32',
      badgeBorder: '#B87333',
      badgeBg: 'rgba(205, 127, 50, 0.15)',
      perks: 'Cooldown 2h • Recursos + Componentes • Salvaged Axe & Icepick • Chás de Farm'
    },
    bronze: {
      name: 'VIP BRONZE',
      price: 'R$ 14,90',
      numericPrice: 14.90,
      img: 'https://i.imgur.com/Fnji1lo.png',
      badgeColor: '#CD7F32',
      badgeBorder: '#B87333',
      badgeBg: 'rgba(205, 127, 50, 0.15)',
      perks: 'Cooldown 2h • Recursos + Componentes • Salvaged Axe & Icepick • Chás de Farm'
    },
    prata: {
      name: 'VIP Prata',
      price: 'R$ 24,90',
      numericPrice: 24.90,
      img: 'https://i.imgur.com/h1RxapR.png',
      badgeColor: '#E2E8F0',
      badgeBorder: '#94A3B8',
      badgeBg: 'rgba(148, 163, 184, 0.15)',
      perks: 'Cooldown 4h • Mais Recursos & Componentes • Chás de Farm Puros'
    },
    ouro: {
      name: 'VIP Ouro',
      price: 'R$ 39,90',
      numericPrice: 39.90,
      img: 'https://i.imgur.com/yMXx5eQ.png',
      badgeColor: '#FBBF24',
      badgeBorder: '#F59E0B',
      badgeBg: 'rgba(245, 158, 11, 0.18)',
      perks: 'Cooldown 6h • Recursos em Massa • Componentes x6 • Concrete Tools • Chás'
    },
    farmer: {
      name: 'Kit Farmer',
      price: 'R$ 14,90',
      numericPrice: 14.90,
      img: 'https://i.imgur.com/AJ77ULs.png',
      badgeColor: '#10B981',
      badgeBorder: '#059669',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      perks: 'Cooldown 2h • 1x Jackhammer • 1x Chainsaw • 50x Combustível • Chás de Farm'
    },
    airdrop: {
      name: 'Kit Drop',
      price: 'R$ 9,90',
      numericPrice: 9.90,
      img: 'https://i.imgur.com/hEmRo96.png',
      badgeColor: '#EF4444',
      badgeBorder: '#DC2626',
      badgeBg: 'rgba(239, 68, 68, 0.15)',
      perks: 'Cooldown 8h • 1x Supply Signal (Chame o avião C-130 Militar de Airdrop)'
    },
    cartao: {
      name: 'Kit Cartões & Puzzles',
      price: 'R$ 9,90',
      numericPrice: 9.90,
      img: 'https://i.ibb.co/bjSLSX3f/keycard-red-2.png',
      badgeColor: '#3B82F6',
      badgeBorder: '#2563EB',
      badgeBg: 'rgba(59, 130, 246, 0.15)',
      perks: 'Cooldown 8h • 1x Cartão Verde • 1x Cartão Azul • 2x Fusíveis Elétricos'
    },
    eletrica: {
      name: 'Kit Elétrica & Automação',
      price: 'R$ 9,90',
      numericPrice: 9.90,
      img: 'https://i.imgur.com/Q0cjeSA.png',
      badgeColor: '#F59E0B',
      badgeBorder: '#D97706',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      perks: 'Turbina Eólica • Painel Solar • Bateria • Caixas Seletoras & Ferramentas'
    }
  };

  const CART_STORAGE_KEY = 'horizon_cart';
  let activeCheckoutItems = ['ouro'];
  let currentUser = null;
  let pollInterval = null;
  let currentOrderId = null;

  // Normaliza o nome do tier
  function normalizeTierKey(tier) {
    let t = (tier || 'ouro').toLowerCase().trim();
    if (t === 'sobrevivente' || t === 'vip-sobrevivente' || t === 'vipsobrevivente') t = 'bronze';
    if (t === 'kit-farmer' || t === 'kit_farmer') t = 'farmer';
    if (t === 'kit-airdrop' || t === 'kit_airdrop' || t === 'drop' || t === 'kit-drop') t = 'airdrop';
    if (t === 'kit-cartao' || t === 'kit_cartao' || t === 'cards' || t === 'cartoes') t = 'cartao';
    if (t === 'kit-eletrica' || t === 'kit_eletrica' || t === 'eletrico') t = 'eletrica';
    return t;
  }

  // ==================== SISTEMA DE CARRINHO ====================
  function getCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) return [];
      let modified = false;
      parsed.forEach(it => {
        if (!it) return;
        if (it.tier === 'sobrevivente' || it.tier === 'vip-sobrevivente' || (it.name && it.name.toUpperCase().includes('SOBREVIVENTE'))) {
          it.tier = 'bronze';
          it.name = 'VIP BRONZE';
          it.img = '/images/vip_bronze.jpg';
          it.price = 14.90;
          it.priceFormatted = 'R$ 14,90';
          modified = true;
        }
      });
      if (modified) {
        try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(parsed)); } catch (e) { }
      }
      return parsed;
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) { }
    updateCartUI();
  }

  window.getCart = getCart;
  window.saveCart = saveCart;
  window.KITS_INFO = KITS_INFO;
  window.normalizeTierKey = normalizeTierKey;

  window.addToCart = function (tier, redirect = false) {
    const t = normalizeTierKey(tier);
    const kit = KITS_INFO[t];
    if (!kit) return;

    const cart = getCart();
    const exists = cart.find(it => it.tier === t);
    if (!exists) {
      cart.push({
        tier: t,
        name: kit.name,
        price: kit.numericPrice,
        priceFormatted: kit.price,
        img: kit.img,
        badgeColor: kit.badgeColor,
        badgeBorder: kit.badgeBorder,
        badgeBg: kit.badgeBg,
        perks: kit.perks
      });
      saveCart(cart);
    }

    if (redirect) {
      window.location.href = '/checkout?tier=' + encodeURIComponent(t);
    }
  };

  window.removeFromCart = function (tier) {
    let cart = getCart();
    cart = cart.filter(it => it.tier !== tier);
    saveCart(cart);
  };

  window.clearCart = function () {
    saveCart([]);
  };

  window.buyNow = function (tier) {
    const t = normalizeTierKey(tier);
    window.addToCart(t, false);
    window.location.href = '/checkout?tier=' + encodeURIComponent(t);
  };

  window.openCheckoutModal = function (target) {
    let t = 'ouro';
    if (target) {
      if (Array.isArray(target) && target.length > 0) {
        target.forEach(it => window.addToCart(it, false));
        t = target[0];
      } else if (typeof target === 'string' && target !== 'cart') {
        window.addToCart(target, false);
        t = target;
      }
    }
    window.location.href = '/checkout?tier=' + encodeURIComponent(normalizeTierKey(t));
  };

  function updateCartUI() {
    const cart = getCart();
    const count = cart.length;

    // Remove qualquer botão flutuante ou drawer residual caso ainda existam
    const oldFloat = document.getElementById('floating-cart-btn');
    if (oldFloat) oldFloat.remove();
    const oldDrawer = document.getElementById('cart-drawer-overlay');
    if (oldDrawer) oldDrawer.remove();

    // Atualiza badges do cabeçalho
    const headerBadges = document.querySelectorAll('#header-cart-badge, .header-cart-badge');
    headerBadges.forEach(badge => {
      badge.innerText = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    });

    // Atualiza contadores de páginas
    const pageCounts = document.querySelectorAll('#page-cart-count, .page-cart-count');
    pageCounts.forEach(el => {
      el.innerText = count;
      el.style.display = count > 0 ? 'inline-block' : 'none';
    });
  }

  function animateFloatingCart() {
    const badges = document.querySelectorAll('#header-cart-badge, .header-cart-badge');
    badges.forEach(badge => {
      badge.style.transform = 'scale(1.35)';
      setTimeout(() => {
        badge.style.transform = 'scale(1)';
      }, 200);
    });
  }

  window.openCartDrawer = function () {
    window.location.href = '/checkout';
  };

  window.closeCartDrawer = function () {
    const overlay = document.getElementById('cart-drawer-overlay');
    if (overlay) overlay.remove();
  };

  function ensureCartDrawer() { }
  function ensureFloatingCartButton() { }
  function renderCartDrawerContent() { }

  // Carrega usuário da sessão
  async function loadUser() {
    try {
      const cached = localStorage.getItem('horizon_steam_user');
      if (cached) {
        const u = JSON.parse(cached);
        if (u && (u.steamId || u.steamid)) {
          currentUser = u;
        }
      }
    } catch (e) { }

    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated && data.user) {
          currentUser = data.user;
          try {
            localStorage.setItem('horizon_steam_user', JSON.stringify(currentUser));
          } catch (e) { }
        } else {
          currentUser = null;
          try {
            localStorage.removeItem('horizon_steam_user');
          } catch (e) { }
        }
      }
    } catch (e) { }
  }

  loadUser();

  // Cria o modal de Checkout no DOM se não existir
  function ensureModal() {
    if (document.getElementById('checkout-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'checkout-modal-overlay';
    overlay.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(8px);
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: inherit;
    `;

    overlay.onclick = function (e) {
      if (e.target === overlay) window.closeCheckoutModal();
    };

    overlay.innerHTML = `
      <div id="checkout-modal-box" style="
        background: #14151a;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        max-width: 490px;
        width: 100%;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 30px 80px rgba(0,0,0,0.95);
        padding: 28px 24px;
        position: relative;
        color: #EDE8E5;
        box-sizing: border-box;
      " onclick="event.stopPropagation()">
        
        <!-- Botão Fechar -->
        <button onclick="window.closeCheckoutModal()" style="
          position: absolute;
          top: 22px;
          right: 22px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #9ca3af;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.color='#9ca3af'">✕</button>

        <!-- Conteúdo Injetado Dinamicamente -->
        <div id="checkout-modal-content"></div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // Abre o modal de checkout (aceita tier único ou array de tiers)
  window.openCheckoutModal = async function (target) {
    ensureModal();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (Array.isArray(target) && target.length > 0) {
      activeCheckoutItems = target.map(normalizeTierKey);
    } else if (typeof target === 'string' && target.trim() !== '' && target !== 'cart') {
      activeCheckoutItems = [normalizeTierKey(target)];
    } else {
      const cart = getCart();
      activeCheckoutItems = cart.length > 0 ? cart.map(it => it.tier) : ['ouro'];
    }

    await loadUser();
    renderStep1();

    const overlay = document.getElementById('checkout-modal-overlay');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // Fecha o modal
  window.closeCheckoutModal = function () {
    const overlay = document.getElementById('checkout-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  // RENDER: Passo 1 - Identificação e Escolha do Pagamento
  function renderStep1() {
    const container = document.getElementById('checkout-modal-content');
    const isCart = activeCheckoutItems.length > 1;

    let itemsData = activeCheckoutItems.map(t => KITS_INFO[t] || KITS_INFO.bronze);
    const totalNumeric = itemsData.reduce((acc, it) => acc + (it.numericPrice || 0), 0);
    const totalFormatted = `R$ ${totalNumeric.toFixed(2).replace('.', ',')}`;

    let defaultSteamId = currentUser ? (currentUser.steamId || currentUser.steamid || '') : '';
    if (!defaultSteamId && window._tempDrawerSteamId) {
      defaultSteamId = window._tempDrawerSteamId;
    }

    let summaryCardHtml = '';
    if (isCart) {
      summaryCardHtml = `
        <div style="background: #1e1f26; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 16px 18px; margin-bottom: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🛒</span>
              <span style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF;">Carrinho (${itemsData.length} itens)</span>
            </div>
            <span style="font-size: 0.72rem; color: #10B981; font-weight: 800; background: rgba(16,185,129,0.1); padding: 2px 8px; border-radius: 999px;">PAGAMENTO ÚNICO</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            ${itemsData.map(it => `
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem;">
                <span style="color: #EDE8E5; display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${it.badgeColor || '#34D399'};"></span>
                  ${it.name}
                </span>
                <span style="color: ${it.badgeColor || '#34D399'}; font-weight: 800;">${it.price}</span>
              </div>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid rgba(255,255,255,0.08); pt-2; padding-top: 8px;">
            <span style="font-size: 0.8rem; font-weight: 700; color: #9CA3AF;">TOTAL DO PIX:</span>
            <span style="font-size: 1.5rem; font-weight: 900; color: #34D399;">${totalFormatted}</span>
          </div>
        </div>
      `;
    } else {
      const singleKit = itemsData[0];
      summaryCardHtml = `
        <div style="background: #1e1f26; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 18px 20px; margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="background: ${singleKit.badgeBg}; border: 1px solid ${singleKit.badgeBorder || singleKit.badgeColor}; color: ${singleKit.badgeColor}; font-weight: 800; font-size: 0.72rem; padding: 3px 12px; border-radius: 9999px; text-transform: uppercase;">
                ${singleKit.name}
              </span>
              <span style="background: rgba(37, 99, 235, 0.12); border: 1px solid #3b82f6; color: #60a5fa; font-weight: 700; font-size: 0.72rem; padding: 3px 10px; border-radius: 9999px;">
                30 DIAS
              </span>
            </div>
            <p style="font-size: 0.78rem; color: #9ca3af; margin: 0; line-height: 1.45;">${singleKit.perks}</p>
          </div>
          <div style="text-align: right; white-space: nowrap;">
            <div style="font-size: 0.7rem; color: #71717a; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">VALOR TOTAL</div>
            <div style="font-size: 1.65rem; font-weight: 900; color: #ffffff;">${singleKit.price}</div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Cabeçalho -->
      <div style="margin-bottom: 20px; padding-right: 44px;">
        <h2 style="font-size: 1.55rem; font-weight: 800; margin: 0 0 6px 0; color: #ffffff; display: flex; align-items: center; gap: 8px;">
          Checkout Seguro
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10B981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);"></span>
        </h2>
        <span style="font-size: 0.8rem; color: #9ca3af; display: flex; align-items: center; gap: 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Mercado Pago • Entrega Automática via Oxide
        </span>
      </div>

      ${summaryCardHtml}

      <!-- Identificação do Jogador -->
      <div style="margin-bottom: 22px;">
        <label style="display: block; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">
          1. CONTA STEAM DO BENEFICIÁRIO
        </label>

        ${currentUser ? `
          <div style="display: flex; align-items: center; gap: 14px; background: #1e1f26; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 14px 18px;">
            ${currentUser.avatar ? `<img src="${currentUser.avatar}" alt="Avatar" style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid #10B981;">` : ''}
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.95rem; font-weight: 800; color: #ffffff;">${currentUser.name || 'Jogador'}</div>
              <div style="font-size: 0.76rem; color: #82ADA4; font-family: monospace;">SteamID: ${currentUser.steamId || currentUser.steamid}</div>
            </div>
            <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10B981; color: #10B981; font-weight: 800; font-size: 0.72rem; padding: 4px 10px; border-radius: 8px;">Conectado</span>
          </div>
          <input type="hidden" id="chk-steamid" value="${currentUser.steamId || currentUser.steamid}">
        ` : `
          <div style="background: #1e1f26; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 18px 20px;">
            <div style="margin-bottom: 14px;">
              <a href="/auth/steam" style="background: #171a21; border: 1px solid rgba(255, 255, 255, 0.15); color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-10 10c0 4.8 3.4 8.8 8 9.8v-4.6a2.5 2.5 0 0 1-1.3-.9l-3.3 1.3a4.4 4.4 0 0 1-.4-2.8l2.6-1.1a2.5 2.5 0 0 1 2.4-.7l2.2-3.2A4.2 4.2 0 1 1 16.2 12l-3.2 2.2a2.5 2.5 0 0 1-.7 2.3v.1a2.5 2.5 0 0 1-2.3 2.5v.9c.7.1 1.3.1 2 .1a10 10 0 0 0 10-10A10 10 0 0 0 12 2zm4.2 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>
                Entrar com Steam (Mais Rápido & Seguro)
              </a>
            </div>
            <div style="text-align: center; position: relative; margin: 16px 0;">
              <span style="background: #1e1f26; padding: 0 12px; color: #71717a; font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">ou digite manualmente</span>
            </div>
            <div>
              <input type="text" id="chk-steamid" value="${defaultSteamId}" placeholder="Ex: 76561198012345678 ou link do perfil" style="width: 100%; background: #14151a; border: 1px solid rgba(255, 255, 255, 0.12); color: #ffffff; padding: 12px 14px; border-radius: 10px; font-size: 0.88rem; box-sizing: border-box; outline: none; font-family: monospace;">
              <span style="font-size: 0.72rem; color: #82ADA4; display: block; margin-top: 6px;">Seus privilégios serão entregues automaticamente para esse SteamID64.</span>
            </div>
          </div>
        `}
      </div>

      <!-- Escolha do Método de Pagamento -->
      <div style="margin-bottom: 18px;">
        <label style="display: block; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 10px;">
          2. MÉTODO DE PAGAMENTO
        </label>

        <!-- Botão PIX -->
        <button type="button" onclick="window.startCheckout('pix')" style="
          width: 100%;
          background: #00A86B;
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 15px 20px;
          font-size: 0.98rem;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 4px 18px rgba(0, 168, 107, 0.35);
          margin-bottom: 10px;
          transition: transform 0.15s, filter 0.15s;
        " onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter='none'">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Pagar com PIX (${totalFormatted})
        </button>

        <!-- Botão Cartão / Mercado Pago -->
        <button type="button" onclick="window.startCheckout('card')" style="
          width: 100%;
          background: #1e1f26;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 13px 20px;
          font-size: 0.88rem;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s;
        " onmouseover="this.style.background='#272932';this.style.borderColor='rgba(255,255,255,0.2)'" onmouseout="this.style.background='#1e1f26';this.style.borderColor='rgba(255,255,255,0.12)'">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          Pagar com Cartão de Crédito / Mercado Pago
        </button>
      </div>

      <!-- Informação -->
      <div style="background: #221616; border: 1px solid rgba(215, 87, 59, 0.25); border-left: 3px solid #D7573B; border-radius: 10px; padding: 12px 14px; font-size: 0.76rem; color: #d1d5db; line-height: 1.45;">
        <strong style="color: #ffffff;">Entrega Automática:</strong> Liberação imediata no servidor assim que o pagamento for aprovado. Válido por <strong>30 dias</strong> com renovação automática opcional.
      </div>
    `;
  }

  // INICIA O CHECKOUT (Chama /api/checkout/create)
  window.startCheckout = async function (method) {
    const steamInput = document.getElementById('chk-steamid');
    let steamId = steamInput ? steamInput.value.trim() : '';

    if (!steamId && currentUser) {
      steamId = currentUser.steamId || currentUser.steamid;
    }

    if (steamId && typeof steamId === 'string') {
      const match = steamId.match(/7656119\d{10}/);
      if (match) steamId = match[0];
    }

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      alert('Por favor, informe um SteamID64 válido com 17 dígitos (ex: 76561198012345678) ou faça login com sua conta Steam!');
      if (steamInput) steamInput.focus();
      return;
    }

    const container = document.getElementById('checkout-modal-content');
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px;">
        <div style="display: inline-block; width: 44px; height: 44px; border: 3px solid rgba(215,87,59,0.3); border-top-color: #D7573B; border-radius: 50%; animation: spinCheckout 0.8s linear infinite;"></div>
        <h3 style="font-size: 1.15rem; font-weight: 800; margin-top: 18px; color: #EDE8E5;">Gerando Pagamento Único Seguro...</h3>
        <p style="font-size: 0.8rem; color: #82ADA4;">Conectando com o Mercado Pago e reservando seus kits no Horizon.</p>
      </div>
      <style>@keyframes spinCheckout { to { transform: rotate(360deg); } }</style>
    `;

    try {
      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: activeCheckoutItems,
          vipTier: activeCheckoutItems.length === 1 ? activeCheckoutItems[0] : 'carrinho',
          steamId: steamId,
          payerName: currentUser ? currentUser.name : ''
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar pagamento');
      }

      currentOrderId = data.orderId;

      if (method === 'card' && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.pix && (data.pix.copiaECola || data.pix.qrCodeBase64)) {
        renderPixScreen(data);
        startPollingPayment(data.orderId, data.paymentId);
      } else if (data.checkoutUrl) {
        renderWaitingScreen(data);
        startPollingPayment(data.orderId, data.paymentId);
      } else {
        throw new Error('Mercado Pago não retornou dados de PIX.');
      }

    } catch (err) {
      console.error('[Start Checkout Error]:', err);
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px;">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">⚠️</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #EF4444; margin: 0 0 8px 0;">Erro no Checkout</h3>
          <p style="font-size: 0.85rem; color: #9CA3AF; margin: 0 0 20px 0;">${err.message || 'Não foi possível se comunicar com o gateway de pagamento.'}</p>
          <button onclick="renderStep1()" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #FFF; padding: 10px 22px; border-radius: 8px; font-weight: 700; cursor: pointer; text-transform: uppercase;">Tentar Novamente</button>
        </div>
      `;
    }
  };

  // RENDER: Tela do PIX (QR Code e Copia e Cola)
  function renderPixScreen(data) {
    const container = document.getElementById('checkout-modal-content');
    const pixCode = data.pix.copiaECola || '';
    const qrImgSrc = data.pix.qrCodeBase64
      ? `data:image/png;base64,${data.pix.qrCodeBase64}`
      : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixCode)}`;

    const totalFormatted = `R$ ${Number(data.amount || 0).toFixed(2).replace('.', ',')}`;

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 18px;">
        <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10B981; color: #10B981; font-weight: 800; font-size: 0.72rem; padding: 3px 12px; border-radius: 9999px; text-transform: uppercase;">
          Pagamento PIX Gerado
        </span>
        <h2 style="font-size: 1.45rem; font-weight: 900; margin: 10px 0 4px 0; color: #ffffff;">
          ${data.vipName || 'Rust Horizon VIP'}
        </h2>
        <div style="font-size: 1.85rem; font-weight: 900; color: #10B981;">
          ${totalFormatted}
        </div>
      </div>

      <!-- QR Code -->
      <div style="text-align: center; margin-bottom: 18px;">
        <div style="display: inline-block; background: #ffffff; padding: 14px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <img src="${qrImgSrc}" alt="QR Code PIX" style="width: 190px; height: 190px; display: block;">
        </div>
        <div style="font-size: 0.74rem; color: #9ca3af; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: pulsePix 1.5s infinite;"></span>
          Aguardando confirmação bancária instantânea...
        </div>
        <style>@keyframes pulsePix { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.9); } }</style>
      </div>

      <!-- Copia e Cola -->
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 6px;">
          Código PIX Copia e Cola
        </label>
        <div style="position: relative;">
          <input type="text" id="pix-copy-input" readonly value="${pixCode}" style="width: 100%; background: #1e1f26; border: 1px solid rgba(255, 255, 255, 0.12); color: #EDE8E5; padding: 11px 44px 11px 12px; border-radius: 10px; font-size: 0.76rem; font-family: monospace; box-sizing: border-box; outline: none;">
          <button onclick="window.copyPixCode()" id="btn-copy-pix" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #10B981; color: #000; border: none; border-radius: 7px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 800;" title="Copiar Código PIX">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>

      <div style="text-align: center;">
        <button onclick="window.copyPixCode()" id="btn-copy-pix-wide" style="width: 100%; background: #10B981; color: #000000; border: none; border-radius: 10px; padding: 13px; font-size: 0.9rem; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
          Copiar Código PIX
        </button>
      </div>
    `;
  }

  function renderWaitingScreen(data) {
    const container = document.getElementById('checkout-modal-content');
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 10px;">
        <div style="display: inline-block; width: 44px; height: 44px; border: 3px solid rgba(215,87,59,0.3); border-top-color: #D7573B; border-radius: 50%; animation: spinCheckout 0.8s linear infinite; margin-bottom: 16px;"></div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin: 0 0 8px 0;">Aguardando Pagamento</h3>
        <p style="font-size: 0.85rem; color: #9CA3AF; margin: 0 0 20px 0;">Conclua a transação na aba do Mercado Pago. O sistema detectará automaticamente a aprovação.</p>
        <a href="${data.checkoutUrl}" target="_blank" style="background: #10B981; color: #000; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 800; font-size: 0.88rem; display: inline-block; text-transform: uppercase;">Abrir Mercado Pago Novamente</a>
      </div>
    `;
  }

  window.copyPixCode = function () {
    const input = document.getElementById('pix-copy-input');
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    try {
      navigator.clipboard.writeText(input.value);
    } catch (e) {
      document.execCommand('copy');
    }
    const wide = document.getElementById('btn-copy-pix-wide');
    if (wide) {
      const orig = wide.innerHTML;
      wide.innerHTML = '✅ Código Copiado com Sucesso!';
      wide.style.background = '#059669';
      wide.style.color = '#FFF';
      setTimeout(() => {
        wide.innerHTML = orig;
        wide.style.background = '#10B981';
        wide.style.color = '#000';
      }, 2500);
    }
    showToast('✅ Código PIX Copiado!');
  };

  // POLLING: Verifica periodicamente se o pagamento foi aprovado
  function startPollingPayment(orderId, paymentId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      try {
        const query = paymentId ? `paymentId=${paymentId}` : `orderId=${orderId}`;
        const res = await fetch(`/api/checkout/status?${query}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data && (data.status === 'approved' || data.order?.status === 'approved')) {
          clearInterval(pollInterval);
          pollInterval = null;
          // Limpa o carrinho ao aprovar compra
          window.clearCart();
          renderSuccessScreen(data.order || data);
        }
      } catch (e) { }
    }, 2800);
  }

  // RENDER: Tela de Sucesso após aprovação
  function renderSuccessScreen(order) {
    const container = document.getElementById('checkout-modal-content');
    const orderId = order.id || currentOrderId;
    const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [order.vip_tier || 'bronze'];

    container.innerHTML = `
      <div style="text-align: center; padding: 20px 10px;">
        <div style="width: 68px; height: 68px; border-radius: 50%; background: rgba(16, 185, 129, 0.2); border: 2px solid #10B981; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: #10B981; margin: 0 auto 16px auto;">
          ✓
        </div>
        <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10B981; color: #10B981; font-weight: 800; font-size: 0.72rem; padding: 3px 12px; border-radius: 9999px; text-transform: uppercase;">
          Pagamento Confirmado
        </span>
        <h2 style="font-size: 1.6rem; font-weight: 900; color: #ffffff; margin: 12px 0 6px 0;">
          Entrega Concluída!
        </h2>
        <p style="font-size: 0.85rem; color: #9CA3AF; margin: 0 0 18px 0; line-height: 1.5;">
          Seus itens foram ativados com sucesso na sua conta Steam!
        </p>

        <div style="background: #1e1f26; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; text-align: left;">
          <div style="font-size: 0.72rem; color: #9CA3AF; text-transform: uppercase; font-weight: 800; margin-bottom: 6px;">Itens Liberados no Servidor:</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${items.map(t => {
      const kit = KITS_INFO[normalizeTierKey(t)] || KITS_INFO.bronze;
      return `<div style="font-size: 0.85rem; font-weight: 800; color: #34D399; display: flex; align-items: center; gap: 6px;"><span>✅</span> ${kit.name} (30 dias)</div>`;
    }).join('')}
          </div>
          <div style="font-size: 0.7rem; color: #82ADA4; font-family: monospace; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
            Pedido: ${orderId}
          </div>
        </div>

        <button onclick="window.closeCheckoutModal()" style="width: 100%; background: #D7573B; color: #FFF; border: none; border-radius: 10px; padding: 13px; font-size: 0.88rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">
          Concluir e Voltar ao Jogo
        </button>
      </div>
    `;
  }

  // Intercepta e vincula eventos ao carregar
  function initStoreEvents() {
    ensureCartDrawer();
    updateCartUI();

    const buyLinks = document.querySelectorAll('a[href*="/comprar/vip-"], a[href^="/comprar/vip-"]');
    buyLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      let tier = 'ouro';
      if (href.includes('bronze')) tier = 'bronze';
      else if (href.includes('prata')) tier = 'prata';
      else if (href.includes('ouro')) tier = 'ouro';

      link.removeAttribute('href');
      link.style.cursor = 'pointer';
      link.onclick = function (e) {
        e.preventDefault();
        window.buyNow(tier);
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStoreEvents);
  } else {
    initStoreEvents();
  }

})();
