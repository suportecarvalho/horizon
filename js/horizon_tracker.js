/**
 * horizon_tracker.js - Telemetria e Analytics em Tempo Real do Site Horizon
 * Rastreia visualizações de página, dispositivos e fontes de tráfego de forma anônima e ultra-leve.
 */
(function() {
  'use strict';

  // Não rastreia o próprio painel administrativo para não inflar as estatísticas
  if (window.location.pathname.startsWith('/admin')) {
    return;
  }

  function getOrSetId(key, storage) {
    try {
      let id = storage.getItem(key);
      if (!id) {
        id = 'hz_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        storage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'anon_' + Math.random().toString(36).substring(2, 8);
    }
  }

  function detectDevice() {
    const ua = navigator.userAgent || '';
    if (/tablet|ipad/i.test(ua)) return 'Tablet';
    if (/mobile|android|iphone/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function detectBrowser() {
    const ua = navigator.userAgent || '';
    if (/edg/i.test(ua)) return 'Edge';
    if (/opr|opera/i.test(ua)) return 'Opera';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    if (/chrome/i.test(ua)) return 'Chrome';
    return 'Outro';
  }

  function detectOS() {
    const ua = navigator.userAgent || '';
    if (/windows/i.test(ua)) return 'Windows';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/macintosh|mac os x/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Outro';
  }

  function trackPageView() {
    try {
      const visitorId = getOrSetId('__hz_vid', localStorage);
      const sessionId = getOrSetId('__hz_sid', sessionStorage);

      const payload = {
        visitorId: visitorId,
        sessionId: sessionId,
        path: window.location.pathname || '/',
        title: document.title || 'Horizon Rust',
        referrer: document.referrer || 'Direto',
        device: detectDevice(),
        browser: detectBrowser(),
        os: detectOS(),
        screen: window.screen ? (window.screen.width + 'x' + window.screen.height) : ''
      };

      const bodyStr = JSON.stringify(payload);

      if (navigator.sendBeacon) {
        const blob = new Blob([bodyStr], { type: 'application/json' });
        navigator.sendBeacon('/api/track', blob);
      } else {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
          keepalive: true
        }).catch(function() {});
      }
    } catch (err) {
      // Ignora silenciosamente qualquer erro
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(trackPageView, 150);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(trackPageView, 150);
    });
  }
})();

