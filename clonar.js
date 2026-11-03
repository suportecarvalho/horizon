/**
 * Ferramenta de Clonagem de Sites - Site Horizon
 * Permite copiar páginas e sites inteiros usando o Google Chrome instalado.
 */

const { chromium } = require('playwright');
const scrapePkg = require('website-scraper');
const scrape = scrapePkg.default || scrapePkg;
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function showHelp() {
  console.log(`
===========================================================
  SITE HORIZON - CLONADOR DE SITES
===========================================================
Uso:
  node clonar.js <URL> [opções]

Opções:
  --single       Salva a página como um único arquivo .html com tudo embutido (SingleFile)
  --assets       Baixa a estrutura completa de pastas (HTML, CSS, Imagens, JS) [padrão]
  --spa          Executa via Playwright com renderização total de JS, scroll e screenshot
  --headed       Abre o Chrome visível para você navegar/fazer login antes de copiar
  --out <pasta>  Nome da pasta/arquivo de saída (opcional)

Exemplos:
  node clonar.js https://exemplo.com --single
  node clonar.js https://exemplo.com --assets --out meu-site
  node clonar.js https://exemplo.com --spa --headed
===========================================================
`);
}

async function cloneSingleFile(url, outputName) {
  const fileName = outputName.endsWith('.html') ? outputName : `${outputName}.html`;
  const outPath = path.resolve(__dirname, fileName);
  console.log(`\n[SingleFile] Clonando ${url} para arquivo único: ${fileName}...`);

  const cmd = `npx single-file --browser-executable-path "${CHROME_PATH}" "${url}" "${outPath}"`;
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`\n✔ Sucesso! Página salva em: ${outPath}`);
  } catch (err) {
    console.error(`\n✖ Erro ao clonar com SingleFile:`, err.message);
  }
}

async function cloneAssets(url, outputDir) {
  const targetDir = path.resolve(__dirname, outputDir);
  console.log(`\n[Assets] Baixando estrutura completa de pastas para: ${targetDir}...`);

  if (fs.existsSync(targetDir)) {
    console.log(`Limpando diretório anterior: ${targetDir}`);
    await fs.remove(targetDir);
  }

  const options = {
    urls: [url],
    directory: targetDir,
    subresources: [
      { tag: 'img', attr: 'src' },
      { tag: 'link', attr: 'href' },
      { tag: 'script', attr: 'src' }
    ],
    sources: [
      { selector: 'img', attr: 'src' },
      { selector: 'link[rel="stylesheet"]', attr: 'href' },
      { selector: 'script', attr: 'src' }
    ]
  };

  try {
    await scrape(options);
    console.log(`\n✔ Sucesso! Site copiado com estrutura completa em: ${targetDir}`);
  } catch (err) {
    console.error(`\n✖ Erro ao baixar assets:`, err.message);
  }
}

async function cloneWithPlaywright(url, outputDir, headed = false) {
  const targetDir = path.resolve(__dirname, outputDir);
  await fs.ensureDir(targetDir);

  console.log(`\n[Playwright] Abrindo Google Chrome (${headed ? 'Modo Visível' : 'Headless'})...`);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !headed,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  console.log(`Navegando para: ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
    console.log('Tempo limite de rede atingido, continuando com o conteúdo carregado...');
  });

  if (headed) {
    console.log('\n[Atenção] O navegador está aberto. Você tem 15 segundos para rolar a página ou fechar popups/cookies se necessário...');
    await page.waitForTimeout(15000);
  } else {
    // Scroll suave para carregar imagens com lazy loading
    console.log('Realizando scroll automático para carregar recursos com lazy loading...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });
    await page.waitForTimeout(2000);
  }

  // Captura o HTML renderizado após execução de todo o JavaScript
  const htmlContent = await page.content();
  const htmlPath = path.join(targetDir, 'index.html');
  await fs.writeFile(htmlPath, htmlContent, 'utf-8');

  // Captura Screenshot completa
  const screenshotPath = path.join(targetDir, 'screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`\n✔ Concluído com sucesso!`);
  console.log(`- HTML renderizado (SPA/JS): ${htmlPath}`);
  console.log(`- Screenshot de página inteira: ${screenshotPath}`);

  await browser.close();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const url = args[0];
  const isSingle = args.includes('--single');
  const isSpa = args.includes('--spa');
  const isHeaded = args.includes('--headed');
  
  let outIndex = args.indexOf('--out');
  let customOut = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : null;

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultName = customOut || `clone_${domain}`;

    if (isSingle) {
      await cloneSingleFile(url, defaultName);
    } else if (isSpa) {
      await cloneWithPlaywright(url, defaultName, isHeaded);
    } else {
      await cloneAssets(url, defaultName);
    }
  } catch (e) {
    console.error('URL inválida ou erro inesperado:', e.message);
  }
}

main();

