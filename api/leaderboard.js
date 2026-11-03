const fs = require('fs');
const path = require('path');

// Cache em memória durante execução da lambda
let memoryData = null;

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
    if (memoryData) {
      return res.status(200).json(memoryData);
    }

    try {
      if (fs.existsSync(dataFile)) {
        const fileContent = fs.readFileSync(dataFile, 'utf-8');
        return res.status(200).json(JSON.parse(fileContent));
      }
    } catch (e) {}

    return res.status(200).json({
      server: "Horizon 2x Solo/Duo/Trio",
      pvp: [],
      recursos: [],
      farming: []
    });
  }

  if (req.method === 'POST') {
    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      data.updated_at = new Date().toISOString();
      memoryData = data;

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

