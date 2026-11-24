/**
 * hero_status.js — Atualização em tempo real de players conectados e status de wipe no Rust Horizon
 * Consulta /api/status a cada 30 segundos e atualiza contadores a cada segundo de forma otimizada (zero memory leaks / DOM thrashing).
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

  var elValDays = null;
  var elValHours = null;
  var elValMins = null;
  var elProgressBar = null;
  var elNextTitle = null;
  var badgeNodes = null;

  var lastElapsedStr = '';
  var lastCdDays = '';
  var lastCdHours = '';
  var lastCdMins = '';
  var lastCdStr = '';
  var lastPct = -1;

  var currentWipedAt = 1795359783000; // Fallback para timestamp do wipe atual
  var currentNextWipe = null;
  var elementsQueried = false;
  var lastUserActivity = Date.now();

  function markActive() {
    lastUserActivity = Date.now();
  }

  function isUserIdle() {
    return (Date.now() - lastUserActivity) > 180000; // 3 minutos sem interação
  }

  function getElements() {
    if (elementsQueried) return;
    elementsQueried = true;

    elCount = document.getElementById('hero-player-count');
    elLabel = document.getElementById('hero-player-label');
    elDot   = document.querySelector('.hero-status-dot, [aria-hidden="true"][style*="22c55e"]');

    elHeroWipeBadge = document.getElementById('hero-wipe-badge-text');
    elWipeElapsed = document.getElementById('wipe-elapsed-time');
    elWipeLastDate = document.getElementById('wipe-last-date');
    elWipeCountdown = document.getElementById('wipe-countdown');
    elWipeNextDate = document.getElementById('wipe-next-date');

    elValDays = document.getElementById('wipe-val-days');
    elValHours = document.getElementById('wipe-val-hours');
    elValMins = document.getElementById('wipe-val-mins');
    elProgressBar = document.getElementById('wipe-progress-bar');
    elNextTitle = document.getElementById('wipe-next-date-title');
    badgeNodes = document.querySelectorAll('#hero-wipe-badge-text, .header-wipe-val, .mobile-wipe-val');
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
    return 'Poucos instantes atrás';
  }

  function formatCountdown(targetDate) {
    var diffMs = Math.max(0, targetDate.getTime() - Date.now());
    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHours = Math.floor(diffMin / 60);
    var diffDays = Math.floor(diffHours / 24);

    var remHours = diffHours % 24;
    var remMin = diffMin % 60;

    var daysStr = String(diffDays).padStart(2, '0');
    var hoursStr = String(remHours).padStart(2, '0');
    var minsStr = String(remMin).padStart(2, '0');

    // Intervalo de wipe do Horizon: bisemanal (3 a 4 dias = ~84 horas)
    var totalCycleHours = 84;
    var hoursLeft = (diffDays * 24) + remHours + (remMin / 60);
    var pct = Math.max(0, Math.min(100, Math.round(((totalCycleHours - hoursLeft) / totalCycleHours) * 100)));

    var str = '';
    if (diffDays > 0) {
      str = diffDays + 'd ' + remHours + 'h restantes';
    } else if (diffHours > 0) {
      str = diffHours + 'h ' + remMin + 'm restantes';
    } else {
      str = Math.max(1, remMin) + 'm restantes (Wipe Iminente)';
    }

    return {
      days: daysStr,
      hours: hoursStr,
      mins: minsStr,
      pct: pct,
      str: str
    };
  }

  function getNextWednesday18h(from) {
    var d = new Date(from);
    var day = d.getUTCDay();
    var targetHour = 21; // 18:00 BRT = 21:00 UTC
    var days = (3 - day + 7) % 7;
    if (days === 0 && d.getUTCHours() >= targetHour) {
      days = 7;
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, targetHour, 0, 0, 0));
  }

  function getNextSaturday12h(from) {
    var d = new Date(from);
    var day = d.getUTCDay();
    var targetHour = 15; // 12:00 BRT = 15:00 UTC
    var days = (6 - day + 7) % 7;
    if (days === 0 && d.getUTCHours() >= targetHour) {
      days = 7;
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, targetHour, 0, 0, 0));
  }

  function getCalculatedNextWipe(refDate) {
    var now = refDate || new Date();
    var nextWed = getNextWednesday18h(now);
    var nextSat = getNextSaturday12h(now);
    return (nextWed.getTime() < nextSat.getTime()) ? nextWed : nextSat;
  }

  function updateStaticWipeLabels() {
    getElements();
    if (currentWipedAt && elWipeLastDate) {
      var d = new Date(currentWipedAt);
      var dateFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      var timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      elWipeLastDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #82ADA4; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Sincronizado em ' + dateFormatted + ' às ' + timeFormatted + ' (Horário de Brasília)';
    }

    var nextWipeDate = currentNextWipe ? new Date(currentNextWipe) : getCalculatedNextWipe();
    var isNextWed = nextWipeDate.getUTCDay() === 3;
    var nextDateLabel = isNextWed ? 'Quarta-feira, 18:00h' : 'Sábado, 12:00h';
    var nextDateFull = isNextWed ? 'Quarta-feira às 18:00h' : 'Sábado às 12:00h';

    if (elNextTitle && elNextTitle.textContent !== nextDateLabel) {
      elNextTitle.textContent = nextDateLabel;
    }
    if (elWipeNextDate) {
      elWipeNextDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #D7573B; flex-shrink: 0;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> ' + nextDateFull + ' (Horário de Brasília)';
    }
  }

  function tickWipeDisplay() {
    getElements();

    if (currentWipedAt) {
      var elapsedStr = formatTimeElapsed(currentWipedAt);
      if (elapsedStr !== lastElapsedStr) {
        lastElapsedStr = elapsedStr;
        if (elHeroWipeBadge) elHeroWipeBadge.textContent = elapsedStr;
        if (badgeNodes && badgeNodes.length) {
          for (var i = 0; i < badgeNodes.length; i++) {
            badgeNodes[i].textContent = elapsedStr;
          }
        }
        if (elWipeElapsed) elWipeElapsed.textContent = 'Wipou há ' + elapsedStr.replace(' atrás', '');
      }
    }

    var nextWipeDate = currentNextWipe ? new Date(currentNextWipe) : getCalculatedNextWipe();
    var cd = formatCountdown(nextWipeDate);

    if (elValDays && cd.days !== lastCdDays) { elValDays.textContent = cd.days; lastCdDays = cd.days; }
    if (elValHours && cd.hours !== lastCdHours) { elValHours.textContent = cd.hours; lastCdHours = cd.hours; }
    if (elValMins && cd.mins !== lastCdMins) { elValMins.textContent = cd.mins; lastCdMins = cd.mins; }
    if (elProgressBar && cd.pct !== lastPct) { elProgressBar.style.width = cd.pct + '%'; lastPct = cd.pct; }
    if (elWipeCountdown && cd.str !== lastCdStr) { elWipeCountdown.textContent = cd.str; lastCdStr = cd.str; }
  }

  function atualizarContador(dados) {
    getElements();
    if (elCount) {
      var qtd = (dados && typeof dados.players === 'number') ? dados.players : 0;
      var online = dados && dados.online !== false;

      elCount.textContent = qtd;
      if (elLabel) {
        if (!online || dados.isWipingOrRestarting) {
          elLabel.textContent = 'servidor reiniciando/wipando';
        } else {
          elLabel.textContent = qtd === 1 ? 'player conectado' : 'players conectados';
        }
      }
      if (elDot) {
        elDot.style.background = (!online || dados.isWipingOrRestarting) ? '#f59e0b' : '#22c55e';
      }
    }

    if (dados && dados.wipedAt) {
      currentWipedAt = dados.wipedAt;
    }
    if (dados && dados.nextWipe) {
      currentNextWipe = dados.nextWipe;
    }

    if (dados && dados.schedule) {
      var elSchedFullTime = document.getElementById('wipe-sched-full-time');
      var elSchedFullSub = document.getElementById('wipe-sched-full-sub');
      
      if (dados.schedule.fullWipe) {
        var fMatch = dados.schedule.fullWipe.match(/(\d{1,2}:\d{2}h?)/i);
        if (fMatch && elSchedFullTime) {
          elSchedFullTime.textContent = fMatch[1].toLowerCase().endsWith('h') ? fMatch[1] : fMatch[1] + 'h';
        }
      }
      if (elSchedFullSub) {
        elSchedFullSub.textContent = 'Primeira quinta-feira do mês';
      }
    }

    updateStaticWipeLabels();
    tickWipeDisplay();
  }

  function fetchStatus() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (dados) {
        atualizarContador(dados);
      })
      .catch(function () {
        updateStaticWipeLabels();
        tickWipeDisplay();
      });
  }

  function iniciar() {
    fetchStatus();

    // Rastreia interação do usuário de forma super leve e passiva
    var events = ['mousemove', 'scroll', 'keydown', 'touchstart'];
    for (var i = 0; i < events.length; i++) {
      window.addEventListener(events[i], markActive, { passive: true });
    }

    // Polling inteligente de status com backoff de ociosidade (AFK)
    var pollTimer = null;
    function scheduleNextPoll() {
      var delay = document.hidden ? 120000 : (isUserIdle() ? 90000 : POLL_INTERVAL);
      pollTimer = setTimeout(function() {
        if (!document.hidden) {
          fetchStatus();
        }
        scheduleNextPoll();
      }, delay);
    }
    scheduleNextPoll();

    // Atualização de tempo decorrido do wipe a cada 20 segundos (mais que suficiente pois a precisão exibida é em minutos)
    setInterval(function() {
      if (!document.hidden) {
        tickWipeDisplay();
      }
    }, 20000);

    // Quando o usuário volta para a aba, atualiza imediatamente
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        markActive();
        fetchStatus();
        tickWipeDisplay();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
