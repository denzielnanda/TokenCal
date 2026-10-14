import fs from 'node:fs/promises';
import sharp from 'sharp';
const mark = JSON.parse(await fs.readFile('assets/brand/mark.json', 'utf8'));
const symbol = (t, c) => `<path d="${mark.t}" fill="${t}"/><path d="${mark.c}" fill="${c}"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x2="0.4" y2="1"><stop stop-color="#292d36"/><stop offset="1" stop-color="#101217"/></linearGradient></defs><rect x="32" y="32" width="960" height="960" rx="220" fill="url(#bg)"/><rect x="33" y="33" width="958" height="958" rx="219" fill="none" stroke="#444956" stroke-width="2"/><g transform="translate(152 152) scale(22.5)">${symbol('#f6f8ff', '#397dff')}</g></svg>`;
await fs.writeFile('assets/brand/icon.svg', icon);
await fs.writeFile(
  'assets/brand/mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${symbol('#f6f8ff', '#397dff')}</svg>`,
);
await sharp(Buffer.from(icon)).png().toFile('assets/icon.png');
await sharp(Buffer.from(icon)).resize(32).png().toFile('assets/tray.png');
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 32 32">${symbol('#000', '#000')}</svg>`;
await sharp(Buffer.from(template)).png().toFile('assets/trayTemplate.png');
console.log('Generated TokenCal app and tray icons from the shared TC mark.');
