/**
 * hero_status.js — Atualização em tempo real de players conectados no Rust Horizon
 * Consulta /api/status (UDP A2S_INFO via servidor.js) a cada 30 segundos.
 */
(function () {
  'use strict';

  var POLL_INTERVAL = 30000; // 30 segundos
  var elCount = null;
  var elLabel = null;
  var elDot   = null;
  var timer   = null;

  function getElements() {
    if (!elCount) elCount = document.getElementById('hero-player-count');
    if (!elLabel) elLabel = document.getElementById('hero-player-label');
    if (!elDot)   elDot   = document.querySelector('.hero-status-dot, [aria-hidden="true"][style*="22c55e"]');
  }

  function atualizarContador(dados) {
    getElements();
    if (!elCount) return;

    var qtd = (dados && typeof dados.players === 'number') ? dados.players : 0;
    var online = dados && dados.online !== false;

    elCount.textContent = qtd;

    if (elLabel) {
      elLabel.textContent = qtd === 1 ? 'player conectado' : 'players conectados';
    }

    if (elDot) {
      elDot.style.background = online ? '#22c55e' : '#ef4444';
    }
  }

  function fetchStatus() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (dados) {
        atualizarContador(dados);
      })
      .catch(function () {
        // Silencioso em caso de falha de rede — mantém o valor atual
      });
  }

  function iniciar() {
    fetchStatus();
    timer = setInterval(fetchStatus, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();

