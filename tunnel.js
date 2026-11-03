const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PREFERRED_SUBDOMAIN = 'horizon-rust-br';

let currentTunnel = null;

async function startTunnel() {
  try {
    console.log(`[Tunnel] Conectando túnel para a porta ${PORT}...`);
    currentTunnel = await localtunnel({
      port: PORT,
      subdomain: PREFERRED_SUBDOMAIN
    });

    console.log(`\n======================================================`);
    console.log(`  🌐 TÚNEL PÚBLICO ATIVO:`);
    console.log(`  ${currentTunnel.url}`);
    console.log(`  API Leaderboard: ${currentTunnel.url}/api/leaderboard`);
    console.log(`======================================================\n`);

    // Salvar a URL atual em um arquivo texto para fácil consulta
    fs.writeFileSync(path.join(__dirname, 'tunnel_url.txt'), currentTunnel.url, 'utf-8');

    currentTunnel.on('close', () => {
      console.log('[Tunnel] Conexão encerrada. Reconectando em 3 segundos...');
      setTimeout(startTunnel, 3000);
    });

    currentTunnel.on('error', (err) => {
      console.error('[Tunnel] Erro:', err.message);
      try { currentTunnel.close(); } catch(e){}
      setTimeout(startTunnel, 3000);
    });

  } catch (err) {
    console.error('[Tunnel] Falha ao iniciar:', err.message);
    setTimeout(startTunnel, 5000);
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Tunnel] Uncaught exception:', err.message);
  setTimeout(startTunnel, 5000);
});

startTunnel();

