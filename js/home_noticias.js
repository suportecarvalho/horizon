/**
 * home_noticias.js — Carrossel automático das Notícias Oficiais da Facepunch (Rust)
 * Sincronizado via /api/noticias com transição contínua suave por todas as notícias e pausa ao passar o mouse.
 */
(function() {
  'use strict';

  var AUTO_INTERVAL = 3800; // 3.8 segundos por slide (devagar e suave)
  var currentIndex = 0;
  var autoTimer = null;
  var isHovered = false;
  
  var cardsData = [
    {
      title: 'Halloween 2026',
      link: 'https://rust.facepunch.com/news/halloween-2026/',
      date: '22 de outubro de 2026',
      image: 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg',
      description: 'Darkness falls upon the island as monsters re-awaken from their slumber. The rifts open in random locations, leading to who-knows-where. Enter if you dare!'
    },
    {
      title: 'Livestock Update',
      link: 'https://rust.facepunch.com/news/livestock/',
      date: '1 de outubro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/September/livestock_blog.jpg',
      description: "This month's update brings a major refresh to farming with the introduction of new Livestock animals, critters, and swimming improvements."
    },
    {
      title: 'Breach and Clear',
      link: 'https://rust.facepunch.com/news/breach-and-clear/',
      date: '3 de setembro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/Skinkbreach-and-clear_media.jpg',
      description: "This month's update brings you Monument Blockers, Breakable Attack Heli Armour, HQM Nodes, Upkeep Group Scaling, and various QoL fixes."
    },
    {
      title: 'Power Trip',
      link: 'https://rust.facepunch.com/news/power-trip/',
      date: '6 de agosto de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/pt_hero.jpg',
      description: "This month's update brings you Player Maintained Monuments in the form of a new Satellite Crash, Dome Pumping, restorable power, and more."
    },
    {
      title: 'Common Ground',
      link: 'https://rust.facepunch.com/news/common-ground/',
      date: '2 de julho de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg',
      description: "This month's update features a New Monument: The Apartment Complex, Rentable Shops, a New Clan System & Table, plus QoL changes and much more!"
    },
    {
      title: 'Built Different',
      link: 'https://rust.facepunch.com/news/built-different/',
      date: '4 de junho de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/Rust%20x%20Built%20Different%20Hero%20-%20Alternative.jpg',
      description: "This month's update brings Rust's biggest player overhaul in years, featuring new player models and animations, a new armour set, and the M16A2 rifle."
    },
    {
      title: 'Upgrade hard, raid harder',
      link: 'https://rust.facepunch.com/news/upgrade-hard-raid-harder/',
      date: '7 de maio de 2026',
      image: 'https://files.facepunch.com/lewis/1b0111b1/raid-harder.jpg',
      description: "This month's update brings you Workbench upgrades, the new Mortar, improved Tin Can Alarm, as well as model refreshes and remakes, plus many QoL fixes."
    },
    {
      title: 'Spring Clean',
      link: 'https://rust.facepunch.com/news/spring-clean/',
      date: '2 de abril de 2026',
      image: 'https://files.facepunch.com/Flavien/spring_clean-blogheader.jpg',
      description: "This month's update brings you TWO new items - the Armoured Ladder Hatch and Water Wheel, additionally loads of QOL improvements, bug fixes, better performance."
    },
    {
      title: 'Shipshape',
      link: 'https://rust.facepunch.com/news/shipshape/',
      date: '5 de março de 2026',
      image: 'https://files.facepunch.com/lewis/1b0211b1/rust_shipshape_hero.jpg',
      description: "This month's update brings massive improvements to how you live, build, and fight on water and in The Deep Sea, plus extended daytime."
    },
    {
      title: 'Lunar New Year 2026',
      link: 'https://rust.facepunch.com/news/lunar-new-year-2026/',
      date: '17 de fevereiro de 2026',
      image: 'https://files.facepunch.com/lewis/1b2611b1/lny_blog_hero.jpg',
      description: "2026's Lunar New Year celebrations have begun! Celebrate the occasion by honouring the Year of the Horse with the Ornate Horse Mask, Horse Armour, and more."
    }
  ];

  function getCardsPerView() {
    var w = window.innerWidth;
    if (w < 640) return 1;
    if (w < 1024) return 2;
    return 3;
  }

  function getMaxIndex() {
    var perView = getCardsPerView();
    return Math.max(0, cardsData.length - perView);
  }

  function renderCards() {
    var track = document.getElementById('fn-carousel-track');
    if (!track) return;

    var perView = getCardsPerView();
    var gap = 20;
    var flexBasis = `calc((100% - ${(perView - 1) * gap}px) / ${perView})`;

    track.innerHTML = cardsData.map(function(item, idx) {
      return `
        <article class="fn-card" data-idx="${idx}" style="
          flex: 0 0 ${flexBasis};
          min-width: 280px;
          background: #171312;
          border: 1px solid rgba(108, 151, 142, 0.28);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        ">
          <!-- Imagem de Capa -->
          <div style="position: relative; width: 100%; height: 185px; overflow: hidden; background: #0c0a09;">
            <img src="${item.image}" alt="${item.title}" loading="lazy" style="
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
              transition: transform 0.4s ease;
            " class="fn-card-img" onerror="this.onerror=null;this.src='https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg';">
          </div>

          <!-- Conteúdo do Card -->
          <div style="padding: 20px 20px 22px 20px; display: flex; flex-direction: column; flex-grow: 1;">
            <time style="font-family: monospace; font-size: 0.72rem; color: #82ADA4; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;">
              ${item.date}
            </time>
            <h3 style="margin: 0 0 10px 0; font-size: 1.15rem; font-weight: 800; color: #FFFFFF; line-height: 1.25; letter-spacing: 0.01em;">
              <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;" class="fn-title-link">
                ${item.title}
              </a>
            </h3>
            <p style="margin: 0 0 18px 0; font-size: 0.86rem; color: #a1a1aa; line-height: 1.55; flex-grow: 1;">
              ${item.description}
            </p>
            <div style="margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; justify-content: space-between;">
              <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: #D7573B;
                font-weight: 800;
                font-size: 0.78rem;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                text-decoration: none;
                transition: gap 0.2s ease, color 0.2s ease;
              " class="fn-read-link">
                Ler na Facepunch
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    renderDots();

    // Hover effects para imagens e cards
    track.querySelectorAll('.fn-card').forEach(function(card) {
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-4px)';
        this.style.borderColor = 'rgba(215, 87, 59, 0.7)';
        this.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.75)';
        var img = this.querySelector('.fn-card-img');
        if (img) img.style.transform = 'scale(1.05)';
      });
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.borderColor = 'rgba(108, 151, 142, 0.28)';
        this.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.55)';
        var img = this.querySelector('.fn-card-img');
        if (img) img.style.transform = 'scale(1)';
      });
    });
  }

  function renderDots() {
    var dotsContainer = document.getElementById('fn-carousel-dots');
    if (!dotsContainer) return;

    var maxIndex = getMaxIndex();
    var totalDots = maxIndex + 1;

    var dotsHtml = [];
    for (var i = 0; i < totalDots; i++) {
      var isActive = (i === currentIndex);
      dotsHtml.push(`
        <button type="button" class="fn-dot" data-idx="${i}" aria-label="Ir para slide ${i + 1}" style="
          width: ${isActive ? '24px' : '8px'};
          height: 8px;
          border-radius: 4px;
          background: ${isActive ? '#D7573B' : 'rgba(255, 255, 255, 0.22)'};
          border: none;
          padding: 0;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        "></button>
      `);
    }
    dotsContainer.innerHTML = dotsHtml.join('');

    dotsContainer.querySelectorAll('.fn-dot').forEach(function(dot) {
      dot.addEventListener('click', function() {
        var targetIdx = parseInt(this.getAttribute('data-idx'), 10);
        goToSlide(targetIdx);
      });
    });
  }

  function updateCardWidths() {
    var track = document.getElementById('fn-carousel-track');
    if (!track) return;
    var perView = getCardsPerView();
    var gap = 20;
    var flexBasis = `calc((100% - ${(perView - 1) * gap}px) / ${perView})`;

    track.querySelectorAll('.fn-card').forEach(function(card) {
      card.style.flex = `0 0 ${flexBasis}`;
    });
    renderDots();
  }

  function updateSlide() {
    var track = document.getElementById('fn-carousel-track');
    var viewport = document.getElementById('fn-carousel-viewport');
    if (!track || !viewport) return;

    var maxIndex = getMaxIndex();

    if (currentIndex > maxIndex) {
      currentIndex = 0; // Loop infinito contínuo
    }
    if (currentIndex < 0) {
      currentIndex = maxIndex;
    }

    var card = track.querySelector('.fn-card');
    if (card) {
      var cardWidth = card.offsetWidth;
      var gap = 20;
      var offset = (cardWidth + gap) * currentIndex;
      track.style.transform = `translateX(-${offset}px)`;
    }

    // Atualizar visualização dos dots
    var dots = document.querySelectorAll('#fn-carousel-dots .fn-dot');
    dots.forEach(function(d, idx) {
      if (idx === currentIndex) {
        d.style.width = '24px';
        d.style.background = '#D7573B';
      } else {
        d.style.width = '8px';
        d.style.background = 'rgba(255, 255, 255, 0.22)';
      }
    });
  }

  function goToSlide(idx) {
    currentIndex = idx;
    updateSlide();
    resetAutoPlay();
  }

  function nextSlide() {
    var maxIndex = getMaxIndex();
    if (currentIndex >= maxIndex) {
      currentIndex = 0; // Transição suave de volta ao início
    } else {
      currentIndex++;
    }
    updateSlide();
  }

  function prevSlide() {
    var maxIndex = getMaxIndex();
    if (currentIndex <= 0) {
      currentIndex = maxIndex;
    } else {
      currentIndex--;
    }
    updateSlide();
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoTimer = setInterval(function() {
      if (!isHovered) {
        nextSlide();
      }
    }, AUTO_INTERVAL);
  }

  function stopAutoPlay() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function resetAutoPlay() {
    stopAutoPlay();
    startAutoPlay();
  }

  function syncNewsFromApi() {
    fetch('/api/noticias')
      .then(function(r) {
        if (!r.ok) throw new Error('Status ' + r.status);
        return r.json();
      })
      .then(function(data) {
        if (Array.isArray(data) && data.length >= 4) {
          cardsData = data;
          renderCards();
          updateSlide();
        }
      })
      .catch(function(err) {
        // Fallback para cardsData já embutido
        console.log('[Notícias] Usando notícias em cache/locais:', err.message);
      });
  }

  function init() {
    renderCards();
    updateSlide();

    var viewport = document.getElementById('fn-carousel-viewport');
    if (viewport) {
      viewport.addEventListener('mouseenter', function() { isHovered = true; });
      viewport.addEventListener('mouseleave', function() { isHovered = false; });
      viewport.addEventListener('touchstart', function() { isHovered = true; }, { passive: true });
      viewport.addEventListener('touchend', function() { isHovered = false; });
    }

    var prevBtn = document.getElementById('fn-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        prevSlide();
        resetAutoPlay();
      });
      prevBtn.addEventListener('mouseenter', function() {
        this.style.background = '#D7573B';
        this.style.borderColor = '#D7573B';
      });
      prevBtn.addEventListener('mouseleave', function() {
        this.style.background = '#1C1615';
        this.style.borderColor = 'rgba(108, 151, 142, 0.35)';
      });
    }

    var nextBtn = document.getElementById('fn-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        nextSlide();
        resetAutoPlay();
      });
      nextBtn.addEventListener('mouseenter', function() {
        this.style.background = '#D7573B';
        this.style.borderColor = '#D7573B';
      });
      nextBtn.addEventListener('mouseleave', function() {
        this.style.background = '#1C1615';
        this.style.borderColor = 'rgba(108, 151, 142, 0.35)';
      });
    }

    window.addEventListener('resize', function() {
      updateCardWidths();
      updateSlide();
    });

    // Inicia autoPlay apenas quando o carrossel de notícias estiver visível na tela
    var newsSection = document.getElementById('noticias') || document.getElementById('fn-carousel-viewport');
    if (newsSection && 'IntersectionObserver' in window) {
      var newsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (e.isIntersecting && !document.hidden) {
            startAutoPlay();
          } else {
            stopAutoPlay();
          }
        });
      }, { threshold: 0.1 });
      newsObserver.observe(newsSection);
    } else {
      startAutoPlay();
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopAutoPlay();
    });

    syncNewsFromApi();
    setInterval(function() {
      if (!document.hidden) {
        syncNewsFromApi();
      }
    }, 600000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
