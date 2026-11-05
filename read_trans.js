const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\lucas\\.gemini\\antigravity\\brain\\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad\\.system_generated\\logs\\transcript.jsonl')
});

rl.on('line', line => {
  const m = line.match(/"step_index":(\d+)/);
  if (m) {
    const idx = parseInt(m[1], 10);
    if (idx >= 5636 && idx <= 5665) {
      try {
        const data = JSON.parse(line);
        console.log(idx, data.tool_calls ? JSON.stringify(data.tool_calls).slice(0, 150) : (data.content ? data.content.slice(0, 150) : ''));
      } catch(e){}
    }
  }
});
