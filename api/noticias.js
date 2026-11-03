const https = require('https');

let newsCache = {
  data: [
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
      description: "This month's update brings a major refresh to farming with the introduction of new Livestock animals, critters, and swimmers. Plus, fresh food recipes."
    },
    {
      title: 'Breach and Clear',
      link: 'https://rust.facepunch.com/news/breach-and-clear/',
      date: '3 de setembro de 2026',
      image: 'https://files.facepunch.com/lewis/2026/August/Skinkbreach-and-clear_media.jpg',
      description: "This month's update brings you Monument Blockers, Breakable Attack Heli Armour, HQM Nodes, Upkeep Group Scaling, various item buffs, and QoL fixes."
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
  ],
  lastFetch: 0
};

function formatPtBrDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function fetchFacepunchNews() {
  const now = Date.now();
  if (now - newsCache.lastFetch < 900000 && newsCache.data && newsCache.data.length >= 8) {
    return Promise.resolve(newsCache.data);
  }

  return new Promise((resolve) => {
    https.get('https://rust.facepunch.com/rss/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 6000
    }, (res) => {
      if (res.statusCode !== 200) return resolve(newsCache.data);
      let b = '';
      res.on('data', chunk => { b += chunk; });
      res.on('end', () => {
        try {
          const items = b.match(/<item>[\s\S]*?<\/item>/g) || [];
          if (items.length === 0) return resolve(newsCache.data);

          const parsed = [];
          for (let i = 0; i < Math.min(items.length, 12); i++) {
            const it = items[i];
            const title = (it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
            const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
            const pubDate = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
            const unescaped = it
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&');

            let img = (unescaped.match(/src="([^"]+\.(?:jpg|png|jpeg|webp))"/i) || [])[1] || '';
            if (!img && title.toLowerCase().includes('halloween')) {
              img = 'https://files.facepunch.com/ashley.cook/2026/October/Halloween_mansion_2_1080.jpg';
            }
            if (!img) {
              img = 'https://files.facepunch.com/lewis/1b2611b1/Rust%20x%20Common%20Grounds%20Hero.jpg';
            }

            const descMatch = unescaped.match(/<description>([\s\S]*?)<\/description>/);
            let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (desc.length > 150) desc = desc.slice(0, 147) + '...';

            parsed.push({
              title,
              link,
              date: formatPtBrDate(pubDate),
              image: img,
              description: desc
            });
          }

          if (parsed.length >= 4) {
            newsCache = { data: parsed, lastFetch: Date.now() };
            return resolve(parsed);
          }
        } catch (e) {}
        resolve(newsCache.data);
      });
    }).on('error', () => resolve(newsCache.data))
      .on('timeout', () => resolve(newsCache.data));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const news = await fetchFacepunchNews();
  return res.status(200).json(news);
};
