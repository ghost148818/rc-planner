// Генерирует PNG-иконки приложения из assets/icons/app-icon.svg.
// Нужен только при изменении SVG: npm run icons. Требует sharp (devDependency).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, 'assets/icons/app-icon.svg');
const OUT = path.join(__dirname, 'assets/icons/gen');

const SIZES = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  // maskable: контент в безопасной зоне 80%, фон до краёв
  { file: 'maskable-512.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-180.png', size: 180, pad: 0 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const svg = fs.readFileSync(SRC);
  for (const { file, size, pad } of SIZES) {
    if (pad) {
      const inner = Math.round(size * (1 - pad * 2));
      const img = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
      await sharp({
        create: { width: size, height: size, channels: 4, background: '#14181e' },
      })
        .composite([{ input: img, gravity: 'centre' }])
        .png()
        .toFile(path.join(OUT, file));
    } else {
      await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(OUT, file));
    }
    console.log('ok', file);
  }
  fs.copyFileSync(SRC, path.join(OUT, 'icon.svg'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
