/**
 * Horizon Rust - Sistema de Checkout Mercado Pago com Entrega Automática VIP (30 Dias)
 */
(function() {
  'use strict';

  const KITS_INFO = {
    bronze: {
      name: 'VIP Bronze',
      price: 'R$ 20,00',
      numericPrice: 20.00,
      badgeColor: '#f59e0b',
      badgeBorder: '#d97706',
      badgeBg: 'rgba(245, 158, 11, 0.12)',
      perks: '18 Itens no Inventário • 2x Caldeirões • Skip Fila com Prioridade'
    },
    prata: {
      name: 'VIP Prata',
      price: 'R$ 40,00',
      numericPrice: 40.00,
      badgeColor: '#e2e8f0',
      badgeBorder: '#94a3b8',
      badgeBg: 'rgba(148, 163, 184, 0.12)',
      perks: '24 Itens no Inventário • Airdrop • 4x Caldeirões • Skip Fila'
    },
    ouro: {
      name: 'VIP Ouro',
      price: 'R$ 62,00',
      numericPrice: 62.00,
      badgeColor: '#fbbf24',
      badgeBorder: '#f59e0b',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      perks: '29 Itens no Inventário • Workbench T3 • Porta Blindada • Mini Refinarias • Skip Fila'
    }
  };

  let currentTier = 'ouro';
  let currentUser = null;
  let pollInterval = null;
  let currentOrderId = null;

  // Carrega usuário da sessão
  async function loadUser() {
    // 1. Tenta carregar imediatamente do cache local para resposta instantânea
    try {
      const cached = localStorage.getItem('horizon_steam_user');
      if (cached) {
        const u = JSON.parse(cached);
        if (u && (u.steamId || u.steamid)) {
          currentUser = u;
        }
      }
    } catch (e) {}

    // 2. Valida com a API
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated && data.user) {
          currentUser = data.user;
          try {
            localStorage.setItem('horizon_steam_user', JSON.stringify(currentUser));
          } catch (e) {}
        } else {
          // Sessão não ativa no servidor
          currentUser = null;
          try {
            localStorage.removeItem('horizon_steam_user');
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  loadUser();

  // Cria o modal no DOM se não existir
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

    overlay.onclick = function(e) {
      if (e.target === overlay) closeCheckoutModal();
    };

    overlay.innerHTML = `
      <div id="checkout-modal-box" style="
        background: #14151a;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        max-width: 480px;
        width: 100%;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 30px 80px rgba(0,0,0,0.95);
        padding: 30px 26px;
        position: relative;
        color: #EDE8E5;
        box-sizing: border-box;
      " onclick="event.stopPropagation()">
        
        <!-- Botão Fechar -->
        <button onclick="closeCheckoutModal()" style="
          position: absolute;
          top: 24px;
          right: 24px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #9ca3af;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          transition: all 0.2s;
        " onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.color='#9ca3af';this.style.background='rgba(255,255,255,0.06)'">✕</button>

        <!-- Conteúdo Dinâmico -->
        <div id="checkout-modal-content"></div>

      </div>
    `;

    document.body.appendChild(overlay);
  }

  // Abre o modal de checkout
  window.openCheckoutModal = async function(tier) {
    ensureModal();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    currentTier = (tier || 'ouro').toLowerCase();
    await loadUser();
    renderStep1();

    const overlay = document.getElementById('checkout-modal-overlay');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // Fecha o modal
  window.closeCheckoutModal = function() {
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
    const kit = KITS_INFO[currentTier] || KITS_INFO.bronze;
    const container = document.getElementById('checkout-modal-content');

    const defaultSteamId = currentUser ? (currentUser.steamId || currentUser.steamid || '') : '';
    const defaultName = currentUser ? (currentUser.name || currentUser.username || 'Jogador') : '';
    const defaultAvatar = currentUser ? currentUser.avatar : '';

    container.innerHTML = `
      <!-- Cabeçalho -->
      <div style="margin-bottom: 22px; padding-right: 44px;">
        <h2 style="font-size: 1.65rem; font-weight: 800; margin: 0 0 6px 0; color: #ffffff; display: flex; align-items: center; gap: 8px;">
          Checkout
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10B981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);"></span>
        </h2>
        <span style="font-size: 0.82rem; color: #9ca3af; display: flex; align-items: center; gap: 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Pagamento Seguro via Mercado Pago
        </span>
      </div>

      <!-- Card do Pacote Selecionado -->
      <div style="
        background: #1e1f26;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 18px 20px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      ">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="
              background: ${kit.badgeBg};
              border: 1px solid ${kit.badgeBorder || kit.badgeColor};
              color: ${kit.badgeColor};
              font-weight: 800;
              font-size: 0.72rem;
              padding: 3px 12px;
              border-radius: 9999px;
              text-transform: uppercase;
              letter-spacing: 0.03em;
            ">
              ${kit.name}
            </span>
            <span style="
              background: rgba(37, 99, 235, 0.12);
              border: 1px solid #3b82f6;
              color: #60a5fa;
              font-weight: 700;
              font-size: 0.72rem;
              padding: 3px 10px;
              border-radius: 9999px;
              display: inline-flex;
              align-items: center;
              gap: 4px;
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              30 DIAS
            </span>
          </div>
          <p style="font-size: 0.8rem; color: #9ca3af; margin: 0; line-height: 1.45;">${kit.perks}</p>
        </div>
        <div style="text-align: right; white-space: nowrap;">
          <div style="font-size: 0.7rem; color: #71717a; text-transform: uppercase; font-weight: 700; letter-spacing: 0.06em; margin-bottom: 3px;">VALOR TOTAL</div>
          <div style="font-size: 1.65rem; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;">${kit.price}</div>
        </div>
      </div>

      <!-- Passo 1: Identificação do Jogador -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 10px;">
          1. IDENTIFICAÇÃO DO JOGADOR
        </label>

        ${currentUser ? `
          <!-- Usuário Já Logado via Steam -->
          <div style="
            display: flex;
            align-items: center;
            gap: 14px;
            background: #1e1f26;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            padding: 14px 18px;
          ">
            <img src="${(defaultAvatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg').replace(/\\\//g, '/')}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.15);">
            <div style="flex: 1;">
              <div style="font-weight: 800; font-size: 1.05rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                ${defaultName}
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10B981;"></span>
                <span style="font-size: 0.68rem; background: rgba(34, 197, 94, 0.15); color: #4ade80; padding: 2px 8px; border-radius: 6px; font-weight: 800; letter-spacing: 0.04em;">CONECTADO</span>
              </div>
              <div style="font-size: 0.8rem; color: #9ca3af; font-family: monospace; margin-top: 2px;">SteamID: ${defaultSteamId}</div>
            </div>
            <input type="hidden" id="chk-steamid" value="${defaultSteamId}">
          </div>
        ` : `
          <!-- Input Manual de SteamID64 ou Link -->
          <div style="
            background: #1e1f26;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            padding: 16px;
          ">
            <input type="text" id="chk-steamid" placeholder="Digite seu SteamID64 (ex: 76561198012345678)..." value="${defaultSteamId}" style="
              width: 100%;
              background: #14151a;
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 10px;
              padding: 13px 15px;
              color: #ffffff;
              font-size: 0.9rem;
              outline: none;
              box-sizing: border-box;
              transition: border-color 0.2s;
            " onfocus="this.style.borderColor='#10B981'" onblur="this.style.borderColor='rgba(255,255,255,0.12)'">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: #9ca3af; margin-top: 8px;">
              <span>SteamID64 com 17 dígitos</span>
              <a href="/auth/steam" style="color: #6C978E; font-weight: 700; text-decoration: underline;">Fazer login com Steam</a>
            </div>
          </div>
        `}
      </div>

      <!-- Passo 2: Escolha como pagar -->
      <div style="margin-bottom: 22px;">
        <label style="display: block; font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 12px;">
          2. ESCOLHA COMO PAGAR
        </label>

        <!-- Botão PIX Direto (Destaque Principal) -->
        <button type="button" onclick="startCheckout('pix')" style="
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
          margin-bottom: 12px;
          transition: transform 0.15s, filter 0.15s;
        " onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter='none'">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Pagar com PIX (Ativação Instantânea)
        </button>

        <!-- Botão Cartão / Mercado Pago -->
        <button type="button" onclick="startCheckout('card')" style="
          width: 100%;
          background: #1e1f26;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 15px 20px;
          font-size: 0.98rem;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s;
        " onmouseover="this.style.background='#272932';this.style.borderColor='rgba(255,255,255,0.2)'" onmouseout="this.style.background='#1e1f26';this.style.borderColor='rgba(255,255,255,0.12)'">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          Pagar com Cartão de Crédito / Mercado Pago
        </button>
      </div>

      <!-- Mensagem Informativa de Prazo -->
      <div style="
        background: #221616;
        border: 1px solid rgba(215, 87, 59, 0.25);
        border-left: 3px solid #D7573B;
        border-radius: 10px;
        padding: 14px 16px;
        font-size: 0.78rem;
        color: #d1d5db;
        line-height: 1.45;
      ">
        <strong style="color: #ffffff;">VIP Automático:</strong> Ativação imediata no servidor assim que o Mercado Pago confirmar o pagamento. O kit e os privilégios são válidos por <strong>30 dias</strong> e expiram automaticamente.
      </div>
    `;
  }

  // INICIA O CHECKOUT (Chama /api/checkout/create)
  window.startCheckout = async function(method) {
    const steamInput = document.getElementById('chk-steamid');
    let steamId = steamInput ? steamInput.value.trim() : '';

    if (!steamId && currentUser) {
      steamId = currentUser.steamId || currentUser.steamid;
    }

    // Extrai SteamID se for URL
    const match = steamId.match(/7656119\d{10}/);
    if (match) steamId = match[0];

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      alert('Por favor, informe um SteamID64 válido com 17 dígitos (ex: 76561198012345678) ou faça login com sua conta Steam!');
      if (steamInput) steamInput.focus();
      return;
    }

    const container = document.getElementById('checkout-modal-content');
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px;">
        <div style="display: inline-block; width: 44px; height: 44px; border: 3px solid rgba(215,87,59,0.3); border-top-color: #D7573B; border-radius: 50%; animation: spinCheckout 0.8s linear infinite;"></div>
        <h3 style="font-size: 1.15rem; font-weight: 800; margin-top: 18px; color: #EDE8E5;">Gerando Pagamento Seguro...</h3>
        <p style="font-size: 0.8rem; color: #82ADA4;">Conectando com o Mercado Pago e reservando seu VIP no Horizon.</p>
      </div>
      <style>@keyframes spinCheckout { to { transform: rotate(360deg); } }</style>
    `;

    try {
      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vipTier: currentTier,
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
        // Redireciona para o checkout do Mercado Pago
        window.open(data.checkoutUrl, '_blank');
        renderWaitingScreen(data, true);
      } else {
        // Renderiza tela de Pix direto com QR Code e Copia e Cola
        renderPixScreen(data);
      }

      // Inicia verificação contínua do pagamento
      startPollingPayment(data.orderId, data.paymentId);

    } catch (err) {
      container.innerHTML = `
        <div style="text-align: center; padding: 25px 10px;">
          <div style="font-size: 2.2rem; color: #ef4444; margin-bottom: 10px;">⚠️</div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #ef4444; margin-bottom: 8px;">Erro ao gerar cobrança</h3>
          <p style="font-size: 0.82rem; color: #a1a1aa; margin-bottom: 20px;">${err.message}</p>
          <button onclick="renderStep1()" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.2);
            color: #EDE8E5;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
          ">Voltar e Tentar Novamente</button>
        </div>
      `;
    }
  };

  // RENDER: Tela do PIX
  function renderPixScreen(data) {
    const kit = KITS_INFO[currentTier] || KITS_INFO.ouro;
    const container = document.getElementById('checkout-modal-content');
    const qrCodeText = data.pix.copiaECola || '';
    
    // QR Code Image (usa a do Mercado Pago base64 se disponível, senão gera via API segura)
    const qrImgSrc = data.pix.qrCodeBase64 && data.pix.qrCodeBase64.length > 100
      ? `data:image/png;base64,${data.pix.qrCodeBase64}`
      : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(qrCodeText)}`;

    container.innerHTML = `
      <div style="text-align: center;">
        
        <!-- Header Pix -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 14px;">
          <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10B981; color: #10B981; font-weight: 800; font-size: 0.72rem; padding: 3px 9px; border-radius: 6px; text-transform: uppercase;">
            PIX MERCADO PAGO
          </span>
          <span style="font-size: 0.85rem; font-weight: 800; color: #EDE8E5;">${kit.name} • ${kit.price}</span>
        </div>

        <!-- QR Code Frame -->
        <div style="
          background: #ffffff;
          padding: 12px;
          border-radius: 12px;
          display: inline-block;
          margin-bottom: 14px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        ">
          <img src="${qrImgSrc}" alt="QR Code PIX Mercado Pago" style="width: 200px; height: 200px; display: block; border-radius: 6px;">
        </div>

        <p style="font-size: 0.8rem; color: #a1a1aa; margin: 0 0 12px 0;">
          Abra o app do seu banco, escolha <strong>Pagar via Pix</strong> e aponte a câmera para o QR Code acima.
        </p>

        <!-- Campo Pix Copia e Cola -->
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #82ADA4; margin-bottom: 6px;">
            Ou copie o código Pix abaixo:
          </label>
          <div style="position: relative;">
            <input type="text" id="chk-pix-code" readonly value="${qrCodeText}" style="
              width: 100%;
              background: #0d0a09;
              border: 1px solid rgba(255,255,255,0.15);
              border-radius: 8px;
              padding: 11px 40px 11px 12px;
              color: #a1a1aa;
              font-family: monospace;
              font-size: 0.75rem;
              box-sizing: border-box;
              text-overflow: ellipsis;
            ">
          </div>
          <button type="button" id="chk-copy-btn" onclick="copyPixCode()" style="
            width: 100%;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.2);
            color: #EDE8E5;
            border-radius: 8px;
            padding: 11px;
            font-size: 0.85rem;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 8px;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copiar Código Pix Copia e Cola
          </button>
        </div>

        <!-- Indicador de Status com Pulso -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          padding: 9px 14px;
          font-size: 0.78rem;
          color: #fbbf24;
        ">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block; animation: pulsePix 1.5s infinite;"></span>
          Aguardando confirmação do pagamento...
        </div>

        <!-- Botão de simulação caso seja modo teste -->
        ${data.isMock ? `
          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.15);">
            <button type="button" onclick="simulatePaymentApproval('${data.orderId}')" style="
              background: rgba(56, 189, 248, 0.15);
              border: 1px solid #38BDF8;
              color: #38BDF8;
              border-radius: 6px;
              padding: 6px 12px;
              font-size: 0.72rem;
              font-weight: 800;
              cursor: pointer;
            ">⚡ Simular Pagamento Aprovado (Teste)</button>
          </div>
        ` : ''}

      </div>
      <style>
        @keyframes pulsePix {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 7px rgba(245, 158, 11, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
      </style>
    `;
  }

  // RENDER: Tela de Aguardo para Cartão
  function renderWaitingScreen(data) {
    const container = document.getElementById('checkout-modal-content');
    container.innerHTML = `
      <div style="text-align: center; padding: 20px 10px;">
        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(56, 189, 248, 0.15); border: 1.5px solid #38BDF8; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 1.5rem;">
          💳
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 800; color: #EDE8E5; margin-bottom: 8px;">Aba de Pagamento Aberta</h3>
        <p style="font-size: 0.82rem; color: #a1a1aa; margin-bottom: 20px;">
          Conclua o pagamento na janela oficial do Mercado Pago. Esta página detectará a aprovação automaticamente!
        </p>
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 0.78rem;
          color: #fbbf24;
        ">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; animation: pulsePix 1.5s infinite;"></span>
          Monitorando status do pedido em tempo real...
        </div>
      </div>
    `;
  }

  // COPIA CÓDIGO PIX
  window.copyPixCode = function() {
    const input = document.getElementById('chk-pix-code');
    const btn = document.getElementById('chk-copy-btn');
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value).then(() => {
      if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '✔ Código Pix Copiado com Sucesso!';
        btn.style.background = 'rgba(16, 185, 129, 0.25)';
        btn.style.borderColor = '#10B981';
        btn.style.color = '#34d399';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.style.background = 'rgba(255,255,255,0.08)';
          btn.style.borderColor = 'rgba(255,255,255,0.2)';
          btn.style.color = '#EDE8E5';
        }, 3000);
      }
    });
  };

  // SIMULA APROVAÇÃO (Para testes)
  window.simulatePaymentApproval = async function(orderId) {
    try {
      const res = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(orderId)}&simulate=true`);
      const data = await res.json();
      if (data && data.status === 'approved') {
        renderSuccessScreen(data);
      }
    } catch (e) {}
  };

  // POLLING: Verifica status a cada 2.5 segundos
  function startPollingPayment(orderId, paymentId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      try {
        const queryParams = new URLSearchParams();
        if (orderId) queryParams.set('orderId', orderId);
        if (paymentId) queryParams.set('paymentId', paymentId);
        const res = await fetch(`/api/checkout/status?${queryParams.toString()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data && data.status === 'approved') {
          clearInterval(pollInterval);
          pollInterval = null;
          renderSuccessScreen(data);
        }
      } catch (e) {}
    }, 2500);
  }

  // RENDER: Tela de Sucesso (VIP Entregue e Concedido)
  function renderSuccessScreen(data) {
    const kit = KITS_INFO[data.vipTier] || KITS_INFO.ouro;
    const container = document.getElementById('checkout-modal-content');

    const expiresDate = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('pt-BR') : '30 dias';

    container.innerHTML = `
      <div style="text-align: center; padding: 20px 10px;">
        
        <!-- Ícone de Sucesso Animado -->
        <div style="
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.15);
          border: 2px solid #10B981;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
          box-shadow: 0 0 35px rgba(16, 185, 129, 0.4);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>

        <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10B981; color: #34d399; font-weight: 800; font-size: 0.72rem; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase;">
          PAGAMENTO APROVADO!
        </span>

        <h2 style="font-size: 1.45rem; font-weight: 900; color: #EDE8E5; margin: 12px 0 6px 0;">
          VIP Ativado com Sucesso!
        </h2>
        <p style="font-size: 0.82rem; color: #82ADA4; margin: 0 0 20px 0;">
          Seus privilégios e kits já foram liberados no servidor de Rust Horizon.
        </p>

        <!-- Detalhes da Concessão -->
        <div style="
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          text-align: left;
          margin-bottom: 20px;
          font-size: 0.82rem;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a1a1aa;">Pacote Adquirido:</span>
            <strong style="color: #F59E0B; text-transform: uppercase;">${kit.name}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a1a1aa;">Jogador / SteamID:</span>
            <span style="color: #EDE8E5; font-family: monospace;">${data.steamId}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a1a1aa;">Duração do VIP:</span>
            <span style="color: #38BDF8; font-weight: 700;">30 Dias (Até ${expiresDate})</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #a1a1aa;">Remoção Automática:</span>
            <span style="color: #82ADA4;">Sim, após 30 dias</span>
          </div>
        </div>

        <!-- Instruções In-Game -->
        <div style="background: rgba(215, 87, 59, 0.12); border: 1px solid rgba(215, 87, 59, 0.3); border-radius: 10px; padding: 12px; margin-bottom: 22px; text-align: left;">
          <div style="font-size: 0.8rem; font-weight: 800; color: #ff8b70; margin-bottom: 4px;">🎮 Como resgatar no Rust:</div>
          <p style="font-size: 0.78rem; color: #EDE8E5; margin: 0; line-height: 1.4;">
            Entre no servidor Horizon e digite no chat <strong>/kit</strong> para resgatar os itens do seu inventário VIP.<br>
            Você também pode digitar <strong>/vip</strong> a qualquer momento para conferir os dias restantes.
          </p>
        </div>

        <button type="button" onclick="closeCheckoutModal()" style="
          width: 100%;
          background: #D7573B;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-size: 0.9rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s;
        " onmouseover="this.style.background='#b84329'" onmouseout="this.style.background='#D7573B'">
          Concluir e Voltar à Loja
        </button>

      </div>
    `;
  }

  // Intercepta os botões "Comprar" existentes na página
  function bindBuyButtons() {
    const buyLinks = document.querySelectorAll('a[href*="/comprar/vip-"], a[href^="/comprar/vip-"], #modal-kit-buy-btn');
    buyLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      let tier = 'ouro';
      if (href.includes('bronze')) tier = 'bronze';
      else if (href.includes('prata')) tier = 'prata';
      else if (href.includes('ouro')) tier = 'ouro';

      link.removeAttribute('href');
      link.style.cursor = 'pointer';
      link.onclick = function(e) {
        e.preventDefault();
        // Fecha modal de kit se estiver aberto
        const kitOverlay = document.getElementById('kit-modal-overlay');
        if (kitOverlay) kitOverlay.style.display = 'none';
        openCheckoutModal(tier);
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBuyButtons);
  } else {
    bindBuyButtons();
  }
})();

