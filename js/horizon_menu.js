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
  }

  function initHeaderServerInfo() {
    var headerDireita = document.querySelector('.site-header-direita');
    if (headerDireita && !headerDireita.querySelector('.horizon-header-server-info')) {
      var serverInfo = document.createElement('div');
      serverInfo.className = 'horizon-header-server-info';
      serverInfo.innerHTML = `
        <div class="horizon-header-ip" onclick="navigator.clipboard.writeText('connect 179.198.115.201'); var el=this.querySelector('.header-ip-val'); var old=el.textContent; el.textContent='COPIADO!'; setTimeout(function(){ el.textContent=old; }, 2000);" title="Clique para copiar: connect 179.198.115.201">
          <span class="header-ip-label">IP:</span>
          <span class="header-ip-val">179.198.115.201</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="header-ip-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </div>
        <a href="/#wipe" class="horizon-header-wipe" title="Ver cronograma e status do wipe">
          <span class="header-wipe-label">WIPE:</span>
          <span class="header-wipe-val" id="header-wipe-badge-text">Hoje</span>
        </a>
      `;
      headerDireita.insertBefore(serverInfo, headerDireita.firstChild);
    }

    var drawer = document.getElementById('horizon-mobile-drawer');
    var mobileLinks = drawer ? drawer.querySelector('.horizon-mobile-nav-links') : null;
    if (drawer && mobileLinks && !drawer.querySelector('.horizon-mobile-server-info')) {
      var mobileServerInfo = document.createElement('div');
      mobileServerInfo.className = 'horizon-mobile-server-info';
      mobileServerInfo.innerHTML = `
        <div class="horizon-mobile-ip-btn" onclick="navigator.clipboard.writeText('connect 179.198.115.201'); var el=this.querySelector('.mobile-ip-val'); var old=el.textContent; el.textContent='IP COPIADO!'; setTimeout(function(){ el.textContent=old; }, 2000);" title="Copiar IP do Servidor">
          <span class="mobile-ip-label">IP:</span>
          <span class="mobile-ip-val">179.198.115.201</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </div>
        <a href="/#wipe" class="horizon-mobile-wipe-btn" title="Status do Wipe">
          <span class="mobile-wipe-label">WIPE:</span>
          <span class="mobile-wipe-val header-wipe-val">Hoje</span>
        </a>
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHorizonMenu);
  } else {
    initHorizonMenu();
  }
})();

