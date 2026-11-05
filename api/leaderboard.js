const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwgswqwqwrnpmcirajre.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Z3N3cXdxd3JucG1jaXJhanJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mzc0NzgxMiwiZXhwIjoyMTA5MzIzODEyfQ.GPb3PY0kWwQZwfSVo4wp6QC_3ee-cW0_OYiTkZVIW4U';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
  } catch (e) {}
}

const LEADERBOARD_DOC_ID = '__horizon_leaderboard_db__';
let memoryData = null;
let lastMemoryTime = 0;
const CACHE_TTL_MS = 20000; // 20 segundos

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, Bypass-Tunnel-Reminder');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const dataFile = path.join(process.cwd(), 'data', 'leaderboard.json');

  if (req.method === 'GET') {
    const isCacheValid = memoryData && (Date.now() - lastMemoryTime < CACHE_TTL_MS) && ((memoryData.pvp && memoryData.pvp.length > 0) || (memoryData.raid && memoryData.raid.length > 0));
    if (isCacheValid) {
      return res.status(200).json(memoryData);
    }

    // 1. Tenta carregar do Supabase (mais recente sincronizado pelo plugin)
    if (supabase) {
      try {
        const { data: row } = await supabase
          .from('feed_posts')
          .select('caption')
          .eq('id', LEADERBOARD_DOC_ID)
          .maybeSingle();

        if (row && row.caption) {
          const parsed = JSON.parse(row.caption);
          memoryData = parsed;
          lastMemoryTime = Date.now();
          return res.status(200).json(parsed);
        }
      } catch (err) {}
    }

    // 2. Fallback para arquivo local no repositório
    try {
      if (fs.existsSync(dataFile)) {
        const fileContent = fs.readFileSync(dataFile, 'utf-8');
        const parsed = JSON.parse(fileContent);
        memoryData = parsed;
        return res.status(200).json(parsed);
      }
    } catch (e) {}

    return res.status(200).json({
      server: "Horizon 2x Solo/Duo/Trio",
      pvp: [],
      recursos: [],
      farming: [],
      raid: []
    });
  }

  if (req.method === 'POST') {
    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      data.updated_at = new Date().toISOString();
      memoryData = data;

      // Persistir no Supabase para acesso global no Vercel
      if (supabase) {
        try {
          await supabase.from('feed_posts').upsert([{
            id: LEADERBOARD_DOC_ID,
            author_steamid: '0',
            author_name: 'Leaderboard System',
            author_avatar: '',
            image_url: 'https://files.facepunch.com/rust/item/trophy.png',
            caption: JSON.stringify(data),
            tag: '__system__'
          }], { onConflict: 'id' });
        } catch (errSupabase) {
          console.error('[Leaderboard Supabase Error]', errSupabase);
        }
      }

      // Persistir em /tmp (para instâncias ativas do serverless)
      try {
        fs.writeFileSync('/tmp/leaderboard.json', JSON.stringify(data), 'utf-8');
      } catch (e) {}

      return res.status(200).json({ success: true, message: 'Dados do ranking atualizados no Horizon!' });
    } catch (err) {
      return res.status(400).json({ error: 'JSON inválido', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};
