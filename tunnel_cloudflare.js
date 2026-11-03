const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SERVER_CONFIG_DIR = 'C:/Users/lucas/Desktop/Server Rust Horizon/oxide/config';
const CLOUDFLARED_EXE = path.join(ROOT_DIR, 'cloudflared.exe');

let proc = null;

function updateConfigs(apiUrl) {
  const configData = {
    "UrlDaApiDoSite": apiUrl,
    "IntervaloDeSincronizacaoMinutos": 5,
    "NomeDoServidor": "Horizon 2x Solo/Duo/Trio",
    "LimiteJogadoresPorAba": 100
  };

  const targetFiles = [
    path.join(ROOT_DIR, 'HorizonLeaderboards.json'),
    path.join(SERVER_CONFIG_DIR, 'HorizonLeaderboards.json')
  ];

  for (const f of targetFiles) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(configData, null, 2), 'utf-8');
      console.log(`[Config] Salvo em: ${f}`);
    } catch (e) {
      console.warn(`[Config] Aviso ao salvar ${f}:`, e.message);
    }
  }

  // Atualizar default no HorizonLeaderboards.cs
  const csFile = path.join(ROOT_DIR, 'HorizonLeaderboards.cs');
  if (fs.existsSync(csFile)) {
    let cs = fs.readFileSync(csFile, 'utf-8');
    cs = cs.replace(/public string ApiUrl \{ get; set; \} = "[^"]*";/, `public string ApiUrl { get; set; } = "${apiUrl}";`);
    fs.writeFileSync(csFile, cs, 'utf-8');
    console.log(`[Plugin] URL padrão atualizada no HorizonLeaderboards.cs`);
    
    // Copiar para pasta do server
    const serverPlugin = 'C:/Users/lucas/Desktop/Server Rust Horizon/oxide/plugins/HorizonLeaderboards.cs';
    try {
      fs.copyFileSync(csFile, serverPlugin);
      console.log(`[Plugin] Copiado para: ${serverPlugin}`);
    } catch(e){}
  }
}

function startCloudflared() {
  console.log('[Cloudflare] Iniciando túnel oficial Cloudflare na porta 3000...');
  proc = spawn(CLOUDFLARED_EXE, ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let urlDetected = false;

  const handleOutput = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlDetected) {
      urlDetected = true;
      const baseUrl = match[0];
      const apiUrl = `${baseUrl}/api/leaderboard`;

      console.log('\n======================================================');
      console.log('  🚀 TÚNEL CLOUDFLARE 100% OPERACIONAL:');
      console.log(`  Site:            ${baseUrl}`);
      console.log(`  Endpoint API:    ${apiUrl}`);
      console.log('======================================================\n');

      fs.writeFileSync(path.join(ROOT_DIR, 'tunnel_url.txt'), baseUrl, 'utf-8');
      updateConfigs(apiUrl);
    }
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('close', (code) => {
    console.log(`[Cloudflare] Processo finalizado com código ${code}. Reiniciando em 5 segundos...`);
    urlDetected = false;
    setTimeout(startCloudflared, 5000);
  });
}

startCloudflared();
