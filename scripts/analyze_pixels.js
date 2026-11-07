const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('C:/Users/lucas/.gemini/antigravity/brain/1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad/.user_uploaded/media_1794093366870_cfb261cd.png');

// Find IDAT chunks
let idatChunks = [];
let offset = 8;
while (offset < buf.length) {
  const len = buf.readUInt32BE(offset);
  const type = buf.slice(offset + 4, offset + 8).toString();
  if (type === 'IDAT') {
    idatChunks.push(buf.slice(offset + 8, offset + 8 + len));
  }
  offset += 12 + len;
}

const idat = Buffer.concat(idatChunks);
const decompressed = zlib.inflateSync(idat);
console.log('Decompressed size:', decompressed.length);

// Each scanline is 1 filter byte + 750 * 4 bytes (RGBA) = 3001 bytes per line
// 74 lines
const width = 750;
const height = 74;

// Let's sample line 37 (middle of text) and lines 50-70 (bottom of text / underline)
let nonBlackPixels = [];
for (let y = 0; y < height; y++) {
  let lineHasColoredPixel = false;
  let colorsInLine = [];
  for (let x = 0; x < width; x++) {
    const idx = y * (width * 4 + 1) + 1 + x * 4;
    const r = decompressed[idx];
    const g = decompressed[idx + 1];
    const b = decompressed[idx + 2];
    const a = decompressed[idx + 3];
    if (r > 40 || g > 40 || b > 40) {
      lineHasColoredPixel = true;
      if (colorsInLine.length < 5) colorsInLine.push({x, r, g, b, a});
    }
  }
  if (lineHasColoredPixel) {
    console.log(`Line y=${y} has colors:`, colorsInLine[0]);
  }
}
