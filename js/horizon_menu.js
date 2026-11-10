/**
 * Horizon Rust - Menu Superior & Mobile Sanduíche
 * Gerencia a navegação desktop, o menu gaveta no mobile e o destaque da página ativa.
 */
(function () {
  'use strict';

  function initHorizonMenu() {
    var toggleBtn = document.querySelector('.horizon-mobile-toggle');
    var drawer = document.getElementById('horizon-mobile-drawer');
    var closeBtn = document.querySelector('.horizon-mobile-close');
    var backdrop = document.querySelector('.horizon-mobile-backdrop');
    var mobileLinks = document.querySelectorAll('.horizon-mobile-link');

    function openMenu() {
      if (!drawer || !toggleBtn) return;
      drawer.classList.add('is-open');
      toggleBtn.classList.add('is-open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('horizon-menu-locked');
    }

    function closeMenu() {
      if (!drawer || !toggleBtn) return;
      drawer.classList.remove('is-open');
      toggleBtn.classList.remove('is-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('horizon-menu-locked');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (drawer && drawer.classList.contains('is-open')) {
          closeMenu();
        } else {
          openMenu();
        }
      });
    }

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

    updateHeaderCartBadge();
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

