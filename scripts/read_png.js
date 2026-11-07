const fs = require('fs');

// Simple PNG decoder to read pixels from media_1794093366870_cfb261cd.png
const buf = fs.readFileSync('C:/Users/lucas/.gemini/antigravity/brain/1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad/.user_uploaded/media_1794093366870_cfb261cd.png');

// Check PNG signature
console.log('PNG magic:', buf.slice(0, 8).toString('hex'));
// Find IHDR chunk
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
console.log('Image dimensions:', width, 'x', height);
