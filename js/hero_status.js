/**
 * hero_status.js — Atualização em tempo real de players conectados e status de wipe no Rust Horizon
 * Consulta /api/status a cada 30 segundos e atualiza contadores a cada segundo.
 */
(function () {
  'use strict';

  var POLL_INTERVAL = 30000; // 30 segundos
  var elCount = null;
  var elLabel = null;
  var elDot   = null;

  var elHeroWipeBadge = null;
  var elWipeElapsed = null;
  var elWipeLastDate = null;
  var elWipeCountdown = null;
  var elWipeNextDate = null;

  var currentWipedAt = 1793883961000; // Fallback para timestamp do wipe atual
  var currentNextWipe = null;

  function getElements() {
    if (!elCount) elCount = document.getElementById('hero-player-count');
    if (!elLabel) elLabel = document.getElementById('hero-player-label');
    if (!elDot)   elDot   = document.querySelector('.hero-status-dot, [aria-hidden="true"][style*="22c55e"]');

    if (!elHeroWipeBadge) elHeroWipeBadge = document.getElementById('hero-wipe-badge-text');
    if (!elWipeElapsed) elWipeElapsed = document.getElementById('wipe-elapsed-time');
    if (!elWipeLastDate) elWipeLastDate = document.getElementById('wipe-last-date');
    if (!elWipeCountdown) elWipeCountdown = document.getElementById('wipe-countdown');
    if (!elWipeNextDate) elWipeNextDate = document.getElementById('wipe-next-date');
  }

  function formatTimeElapsed(wipedAtMs) {
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
    return 'Recém-wipado!';
  }

  function formatCountdown(targetDate) {
    if (!targetDate) return '--d --h --m';
    var diffMs = targetDate.getTime() - Date.now();
    if (diffMs <= 0) return 'Wipando agora!';

    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHours = Math.floor(diffMin / 60);
    var diffDays = Math.floor(diffHours / 24);

    var remHours = diffHours % 24;
    var remMin = diffMin % 60;
    var remSec = diffSec % 60;

    if (diffDays > 0) {
      return diffDays + 'd ' + remHours + 'h ' + remMin + 'm';
    }
    return remHours + 'h ' + remMin + 'm ' + (remSec < 10 ? '0' : '') + remSec + 's';
  }

  function getCalculatedNextWipe() {
    var d = new Date();
    var currentDay = d.getUTCDay();
    var daysUntilSaturday = (6 - currentDay + 7) % 7;
    if (daysUntilSaturday === 0 && d.getUTCHours() >= 15) {
      daysUntilSaturday = 7;
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilSaturday, 15, 0, 0, 0));
  }

  function tickWipeDisplay() {
    getElements();

    if (currentWipedAt) {
      var elapsedStr = formatTimeElapsed(currentWipedAt);
      if (elHeroWipeBadge) elHeroWipeBadge.textContent = elapsedStr;
      if (elWipeElapsed) elWipeElapsed.textContent = 'Wipou há ' + elapsedStr.replace(' atrás', '');

      if (elWipeLastDate) {
        var d = new Date(currentWipedAt);
        var dateFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        var timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        elWipeLastDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #82ADA4; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Sincronizado em ' + dateFormatted + ' às ' + timeFormatted + ' (Horário de Brasília)';
      }
    }

    var nextWipeDate = currentNextWipe ? new Date(currentNextWipe) : getCalculatedNextWipe();
    if (elWipeCountdown) {
      elWipeCountdown.textContent = formatCountdown(nextWipeDate);
    }

    if (elWipeNextDate) {
      elWipeNextDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #D7573B; flex-shrink: 0;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> Sábado às 12:00h (Horário de Brasília)';
    }
  }

  function atualizarContador(dados) {
    getElements();
    if (elCount) {
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

    if (dados && dados.wipedAt) {
      currentWipedAt = dados.wipedAt;
    }
    if (dados && dados.nextWipe) {
      currentNextWipe = dados.nextWipe;
    }

    if (dados && dados.schedule) {
      var elSchedMap = document.getElementById('wipe-sched-map');
      var elSchedFull = document.getElementById('wipe-sched-full');
      var elSchedType = document.getElementById('wipe-sched-type');
      if (elSchedMap && dados.schedule.mapWipe) elSchedMap.textContent = dados.schedule.mapWipe;
      if (elSchedFull && dados.schedule.fullWipe) elSchedFull.textContent = dados.schedule.fullWipe;
      if (elSchedType) {
        var sTipo = "Horizon 2x (Max 4)";
        if (dados.schedule.type && !dados.schedule.type.includes("Solo") && !dados.schedule.type.includes("Quad")) {
          sTipo = dados.schedule.type;
        }
        elSchedType.textContent = sTipo;
      }
    }

    tickWipeDisplay();
  }

  function fetchStatus() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (dados) {
        atualizarContador(dados);
      })
      .catch(function () {
        tickWipeDisplay();
      });
  }

  function iniciar() {
    fetchStatus();
    setInterval(function() {
      if (!document.hidden) {
        fetchStatus();
      }
    }, POLL_INTERVAL);
    setInterval(function() {
      if (!document.hidden) {
        tickWipeDisplay();
      }
    }, 1000); // Atualiza cronômetro todo segundo
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
