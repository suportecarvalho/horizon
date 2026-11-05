const { spawn } = require('child_process');
const fs = require('fs');

async function capture(url, outPath, width, height) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    `--window-size=${width},${height}`,
    'about:blank'
  ]);

  // wait 1s for chrome to start
  await new Promise(r => setTimeout(r, 1200));

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const list = await listRes.json();
    const wsUrl = list[0].webSocketDebuggerUrl;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let id = 1;
      const send = (method, params = {}) => {
        const msgId = id++;
        ws.send(JSON.stringify({ id: msgId, method, params }));
        return msgId;
      };

      ws.onopen = async () => {
        send('Page.enable');
        send('Page.navigate', { url });
      };

      ws.onmessage = async (evt) => {
        const data = JSON.parse(evt.data);
        if (data.method === 'Page.loadEventFired') {
          // wait 1.5s for data fetch and render
          setTimeout(() => {
            // scroll into ranking
            send('Runtime.evaluate', {
              expression: `
                const el = document.getElementById('ranking') || document.querySelector('.ranking');
                if (el) el.scrollIntoView();
              `
            });
            setTimeout(() => {
              const shotId = send('Page.captureScreenshot', { format: 'png' });
              ws.addEventListener('message', function onShot(shotEvt) {
                const sData = JSON.parse(shotEvt.data);
                if (sData.id === shotId && sData.result && sData.result.data) {
                  fs.writeFileSync(outPath, Buffer.from(sData.result.data, 'base64'));
                  ws.removeEventListener('message', onShot);
                  ws.close();
                  resolve();
                }
              });
            }, 800);
          }, 1500);
        }
      };

      ws.onerror = reject;
    });
  } finally {
    chromeProc.kill();
  }
}

async function main() {
  const outDir = 'C:\\Users\\lucas\\.gemini\\antigravity\\brain\\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad';
  console.log('Capturing Desktop...');
  await capture('http://localhost:3000/?tab=raid#ranking', `${outDir}\\verified_home_raid_desktop.png`, 1440, 1050);
  console.log('Capturing Mobile...');
  await capture('http://localhost:3000/?tab=raid#ranking', `${outDir}\\verified_home_raid_mobile.png`, 430, 950);
  console.log('Done all captures!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

