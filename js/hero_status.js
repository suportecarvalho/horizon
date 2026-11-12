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
    if (!targetDate) return { str: '--d --h --m', days: '--', hours: '--', mins: '--', pct: 50 };
    var diffMs = targetDate.getTime() - Date.now();
    if (diffMs <= 0) return { str: 'Wipando agora!', days: '00', hours: '00', mins: '00', pct: 100 };

    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHours = Math.floor(diffMin / 60);
    var diffDays = Math.floor(diffHours / 24);

    var remHours = diffHours % 24;
    var remMin = diffMin % 60;
    var remSec = diffSec % 60;

    // Ciclo bisemanal: Quarta 18h até Sábado 12h = 66h | Sábado 12h até Quarta 18h = 102h
    var isNextSat = targetDate.getUTCDay() === 6;
    var totalCycleMs = isNextSat ? (66 * 60 * 60 * 1000) : (102 * 60 * 60 * 1000);
    var elapsedMs = Math.max(0, totalCycleMs - diffMs);
    var pct = Math.max(6, Math.min(100, Math.round((elapsedMs / totalCycleMs) * 100)));

    var dStr = String(diffDays).padStart(2, '0');
    var hStr = String(remHours).padStart(2, '0');
    var mStr = String(remMin).padStart(2, '0');

    return {
      str: diffDays + 'd ' + remHours + 'h ' + remMin + 'm',
      days: dStr,
      hours: hStr,
      mins: mStr,
      pct: pct
    };
  }

  function getNextWednesday18h(refDate) {
    var d = new Date(refDate);
    // Quarta-feira (day 3) às 18:00h BRT = 21:00h UTC
    var targetDay = 3;
    var targetHour = 21;
    var currentDay = d.getUTCDay();
    var days = (targetDay - currentDay + 7) % 7;
    if (days === 0 && (d.getUTCHours() > targetHour || (d.getUTCHours() === targetHour && (d.getUTCMinutes() > 0 || d.getUTCSeconds() > 0)))) {
      days = 7;
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, targetHour, 0, 0, 0));
  }

  function getNextSaturday12h(refDate) {
    var d = new Date(refDate);
    // Sábado (day 6) às 12:00h BRT = 15:00h UTC
    var targetDay = 6;
    var targetHour = 15;
    var currentDay = d.getUTCDay();
    var days = (targetDay - currentDay + 7) % 7;
    if (days === 0 && (d.getUTCHours() > targetHour || (d.getUTCHours() === targetHour && (d.getUTCMinutes() > 0 || d.getUTCSeconds() > 0)))) {
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

  function tickWipeDisplay() {
    getElements();

    if (currentWipedAt) {
      var elapsedStr = formatTimeElapsed(currentWipedAt);
      if (elHeroWipeBadge) elHeroWipeBadge.textContent = elapsedStr;
      document.querySelectorAll('#hero-wipe-badge-text, .header-wipe-val, .mobile-wipe-val').forEach(function (el) {
        el.textContent = elapsedStr;
      });
      if (elWipeElapsed) elWipeElapsed.textContent = 'Wipou há ' + elapsedStr.replace(' atrás', '');

      if (elWipeLastDate) {
        var d = new Date(currentWipedAt);
        var dateFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        var timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        elWipeLastDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #82ADA4; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Sincronizado em ' + dateFormatted + ' às ' + timeFormatted + ' (Horário de Brasília)';
      }
    }

    var nextWipeDate = currentNextWipe ? new Date(currentNextWipe) : getCalculatedNextWipe();
    var cd = formatCountdown(nextWipeDate);

    var elValDays = document.getElementById('wipe-val-days');
    var elValHours = document.getElementById('wipe-val-hours');
    var elValMins = document.getElementById('wipe-val-mins');
    var elProgressBar = document.getElementById('wipe-progress-bar');

    if (elValDays) elValDays.textContent = cd.days;
    if (elValHours) elValHours.textContent = cd.hours;
    if (elValMins) elValMins.textContent = cd.mins;
    if (elProgressBar) elProgressBar.style.width = cd.pct + '%';

    if (elWipeCountdown) {
      elWipeCountdown.textContent = cd.str;
    }

    var isNextWed = nextWipeDate.getUTCDay() === 3;
    var nextDateLabel = isNextWed ? 'Quarta-feira, 18:00h' : 'Sábado, 12:00h';
    var nextDateFull = isNextWed ? 'Quarta-feira às 18:00h' : 'Sábado às 12:00h';

    var elNextTitle = document.getElementById('wipe-next-date-title');
    if (elNextTitle) elNextTitle.textContent = nextDateLabel;

    if (elWipeNextDate) {
      elWipeNextDate.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #D7573B; flex-shrink: 0;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> ' + nextDateFull + ' (Horário de Brasília)';
    }
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
      var elSchedMapTime = document.getElementById('wipe-sched-map-time');
      var elSchedFullTime = document.getElementById('wipe-sched-full-time');
      var elSchedMapSub = document.getElementById('wipe-sched-map-sub');
      var elSchedFullSub = document.getElementById('wipe-sched-full-sub');
      var elSchedLimit = document.getElementById('wipe-sched-limit');
      
      if (elSchedMapSub) {
        elSchedMapSub.textContent = 'Bisemanal (Quartas e Sábados)';
      }
      if (elSchedMapTime) {
        elSchedMapTime.innerHTML = 'Qua 18:00h<br>Sáb 12:00h';
      }
      if (dados.schedule.fullWipe) {
        var fMatch = dados.schedule.fullWipe.match(/(\d{1,2}:\d{2}h?)/i);
        if (fMatch && elSchedFullTime) {
          elSchedFullTime.textContent = fMatch[1].toLowerCase().endsWith('h') ? fMatch[1] : fMatch[1] + 'h';
        }
      }
      if (elSchedFullSub) {
        elSchedFullSub.textContent = 'Primeira quinta-feira do mês';
      }
      if (elSchedLimit) {
        var limStr = dados.schedule.teamLimit || "4 jogadores";
        if (limStr === "(Max 4)" || limStr === "Max 4") limStr = "4 jogadores";
        elSchedLimit.textContent = limStr;
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
