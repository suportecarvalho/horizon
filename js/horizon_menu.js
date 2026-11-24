/**
 * Horizon Rust - Menu Superior & Mobile Sanduíche
 * Gerencia a navegação desktop, o menu gaveta no mobile e o destaque da página ativa.
 */
(function () {
  'use strict';

  function initHorizonMenu() {
    var drawer = document.getElementById('horizon-mobile-drawer');
    var closeBtn = document.querySelector('.horizon-mobile-close');
    var backdrop = document.querySelector('.horizon-mobile-backdrop');
    var mobileLinks = document.querySelectorAll('.horizon-mobile-link');

    function openMenu() {
      if (!drawer) return;
      drawer.classList.add('is-open');
      document.querySelectorAll('.horizon-mobile-toggle, .horizon-user-menu-btn').forEach(function (btn) {
        btn.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      });
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('horizon-menu-locked');
    }

    function closeMenu() {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      document.querySelectorAll('.horizon-mobile-toggle, .horizon-user-menu-btn').forEach(function (btn) {
        btn.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      });
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('horizon-menu-locked');
    }

    window.openHorizonMenu = openMenu;
    window.closeHorizonMenu = closeMenu;
    window.toggleHorizonMenu = function (e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      if (drawer && drawer.classList.contains('is-open')) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.horizon-mobile-toggle, .horizon-user-menu-btn');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleHorizonMenu();
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    mobileLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) {
        closeMenu();
      }
    });

    // Detecta e ativa a aba correspondente à página atual
    var path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    var activeNav = 'inicio';

    if (path.startsWith('/loja')) {
      activeNav = 'loja';
    } else if (path.startsWith('/equipe')) {
      activeNav = 'equipe';
    } else if (path === '' || path === '/' || path.endsWith('/index.html') || path === '/index.html') {
      activeNav = 'inicio';
    } else {
      activeNav = '';
    }

    document.querySelectorAll('.horizon-nav-link, .horizon-mobile-link').forEach(function (link) {
      var navKey = link.getAttribute('data-nav');
      if (navKey && navKey === activeNav) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    initHeaderServerInfo();
    updateHeaderCartBadge();
    initHeaderWipeSync();
  }

  function formatWipeElapsed(wipedAtMs) {
    var diffMs = Math.max(0, Date.now() - wipedAtMs);
    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHours = Math.floor(diffMin / 60);
    var diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      var remHours = diffHours % 24;
      return diffDays + 'd ' + remHours + 'h atrás';
    }
    if (diffHours > 0) {
      var remMin = diffMin % 60;
      return diffHours + 'h ' + remMin + 'm atrás';
    }
    if (diffMin > 0) {
      return diffMin + ' min atrás';
    }
    return 'Poucos instantes atrás';
  }

  function applyHeaderWipe(text) {
    if (!text) return;
    var nodes = document.querySelectorAll('#hero-wipe-badge-text, #header-wipe-badge-text, .header-wipe-val, .mobile-wipe-val');
    nodes.forEach(function (node) {
      node.textContent = text;
    });
  }

  function initHeaderWipeSync() {
    var defaultWipedAt = 1795359783000;
    try {
      var cached = localStorage.getItem('horizon_wiped_at');
      var t = cached ? parseInt(cached, 10) : defaultWipedAt;
      if (t > 0) applyHeaderWipe(formatWipeElapsed(t));
    } catch (e) {
      applyHeaderWipe(formatWipeElapsed(defaultWipedAt));
    }

    async function syncStatus() {
      try {
        var res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) return;
        var data = await res.json();
        if (data && data.wipedAt) {
          var w = Number(data.wipedAt);
          try { localStorage.setItem('horizon_wiped_at', String(w)); } catch (e) {}
          applyHeaderWipe(formatWipeElapsed(w));
        }
      } catch (e) {}
    }

    syncStatus();
    setInterval(function () {
      try {
        var cached = localStorage.getItem('horizon_wiped_at');
        var w = cached ? Number(cached) : defaultWipedAt;
        applyHeaderWipe(formatWipeElapsed(w));
      } catch (e) {}
    }, 20000);
  }

  function initHeaderServerInfo() {
    var headerDireita = document.querySelector('.site-header-direita');
    if (headerDireita && !headerDireita.querySelector('.horizon-header-server-info')) {
      var initialWipeText = formatWipeElapsed(1795359783000);
      try {
        var c = localStorage.getItem('horizon_wiped_at');
        if (c) initialWipeText = formatWipeElapsed(Number(c));
      } catch (e) {}

      var serverInfo = document.createElement('div');
      serverInfo.className = 'horizon-header-server-info';
      serverInfo.innerHTML = `
        <div class="horizon-header-ip" onclick="navigator.clipboard.writeText('connect play.rusthorizon.shop:28015'); var el=this.querySelector('.header-ip-val'); var old=el.textContent; el.textContent='COPIADO!'; setTimeout(function(){ el.textContent=old; }, 2000);" title="Clique para copiar: connect play.rusthorizon.shop:28015">
          <span class="header-ip-label">IP:</span>
          <span class="header-ip-val">play.rusthorizon.shop:28015</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="header-ip-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </div>
        <div class="horizon-header-wipe" title="Status do Wipe">
          <span class="header-wipe-label">WIPE:</span>
          <span class="header-wipe-val" id="header-wipe-badge-text">${initialWipeText}</span>
        </div>
      `;
      headerDireita.insertBefore(serverInfo, headerDireita.firstChild);
    }

    var drawer = document.getElementById('horizon-mobile-drawer');
    var mobileLinks = drawer ? drawer.querySelector('.horizon-mobile-nav-links') : null;
    if (drawer && mobileLinks && !drawer.querySelector('.horizon-mobile-server-info')) {
      var mobileWipeText = formatWipeElapsed(1795359783000);
      try {
        var cMob = localStorage.getItem('horizon_wiped_at');
        if (cMob) mobileWipeText = formatWipeElapsed(Number(cMob));
      } catch (e) {}

      var mobileServerInfo = document.createElement('div');
      mobileServerInfo.className = 'horizon-mobile-server-info';
      mobileServerInfo.innerHTML = `
        <div class="horizon-mobile-ip-btn" onclick="navigator.clipboard.writeText('connect play.rusthorizon.shop:28015'); var el=this.querySelector('.mobile-ip-val'); var old=el.textContent; el.textContent='IP COPIADO!'; setTimeout(function(){ el.textContent=old; }, 2000);" title="Copiar IP do Servidor">
          <span class="mobile-ip-label">IP:</span>
          <span class="mobile-ip-val">play.rusthorizon.shop:28015</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </div>
        <div class="horizon-mobile-wipe-btn" title="Status do Wipe">
          <span class="mobile-wipe-label">WIPE:</span>
          <span class="mobile-wipe-val header-wipe-val">${mobileWipeText}</span>
        </div>
      `;
      mobileLinks.parentNode.insertBefore(mobileServerInfo, mobileLinks);
    }
  }

  function updateHeaderCartBadge() {
    try {
      var raw = localStorage.getItem('horizon_cart');
      if (!raw) return;
      var cart = JSON.parse(raw);
      if (!Array.isArray(cart)) return;
      var modified = false;
      cart.forEach(function (it) {
        if (!it) return;
        if (it.tier === 'sobrevivente' || it.tier === 'vip-sobrevivente' || (it.name && it.name.toUpperCase().indexOf('SOBREVIVENTE') !== -1)) {
          it.tier = 'bronze';
          it.name = 'VIP Bronze';
          it.img = '/images/vip_bronze.jpg';
          it.price = 20.00;
          it.priceFormatted = 'R$ 20,00';
          modified = true;
        }
      });
      if (modified) {
        try { localStorage.setItem('horizon_cart', JSON.stringify(cart)); } catch (e) {}
      }
      var count = cart.length;
      document.querySelectorAll('#header-cart-badge, .header-cart-badge').forEach(function (el) {
        el.innerText = count;
        el.style.display = count > 0 ? 'inline-block' : 'none';
      });
    } catch (e) {}
  }

  window.addEventListener('storage', updateHeaderCartBadge);

  // Carrega telemetria e contador de visitas do site de forma assíncrona
  try {
    if (!window._horizonTrackerLoaded && !window.location.pathname.startsWith('/admin')) {
      window._horizonTrackerLoaded = true;
      var trackScript = document.createElement('script');
      trackScript.src = '/js/horizon_tracker.js';
      trackScript.defer = true;
      document.head.appendChild(trackScript);
    }
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHorizonMenu);
  } else {
    initHorizonMenu();
  }
})();

