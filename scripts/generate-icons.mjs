/**
 * DoneWell Audio — PWA Icon Generator
 * Generates all icon sizes from the DW Audio logo PNG.
 *
 * Places the white logo on a dark background (#111214) with padding,
 * and generates dark/light favicon variants.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Find sharp in pnpm node_modules
let sharp;
try {
  sharp = require('sharp');
} catch {
  const sharpPath = join(__dirname, '..', 'node_modules', '.pnpm', 'sharp@0.34.5', 'node_modules', 'sharp');
  sharp = require(sharpPath);
}

const BG_DARK = '#111214';
const BG_LIGHT = '#f0f0f0';

const LOGO_WHITE = join(publicDir, 'images', 'dwa-logo-white.png');
const LOGO_BLACK = join(publicDir, 'images', 'dwa-logo-black.png');

/**
 * Generate a square icon with the DW Audio logo centered on a background.
 * Logo fills ~85% of the icon (70% for maskable safe zone).
 * Small sizes (<=32px) use sharpen to keep text legible.
 */
async function generateIcon(size, { maskable = false, light = false } = {}) {
  const bg = light ? BG_LIGHT : BG_DARK;
  const logoSrc = light ? LOGO_BLACK : LOGO_WHITE;
  const logoScale = maskable ? 0.75 : 0.92;

  // Resize logo to fit within the padded area, maintaining aspect ratio
  const logoSize = Math.round(size * logoScale);
  let resizer = sharp(logoSrc)
    .resize(logoSize, logoSize, { fit: 'inside', kernel: size <= 32 ? 'lanczos3' : 'lanczos3' });

  // Sharpen small icons aggressively to keep text crisp
  if (size <= 48) {
    resizer = resizer.sharpen({ sigma: 0.8, m1: 3.0, m2: 1.5 }).normalise();
  }

  const logo = await resizer.toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const logoW = logoMeta.width;
  const logoH = logoMeta.height;

  // Center the logo on the background
  const left = Math.round((size - logoW) / 2);
  const top = Math.round((size - logoH) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

const icons = [
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'icon-192.png', size: 192 },
  { name: 'apple-icon.png', size: 180 },
  { name: 'icon-dark-32x32.png', size: 32 },
  { name: 'icon-light-32x32.png', size: 32, light: true },
];

async function main() {
  console.log('Generating DoneWell Audio PWA icons from DW Audio logo...\n');

  for (const icon of icons) {
    const pngBuffer = await generateIcon(icon.size, {
      maskable: icon.maskable,
      light: icon.light,
    });

    writeFileSync(join(publicDir, icon.name), pngBuffer);
    console.log(
      `  ${icon.name} (${icon.size}x${icon.size}${icon.maskable ? ' maskable' : ''}${icon.light ? ' light' : ''})`,
    );
  }

  // Generate favicon.ico from 32px dark icon
  const favicon32 = await generateIcon(32);
  const favicon16 = await generateIcon(16);
  writeFileSync(join(publicDir, 'favicon.ico'), favicon32);
  console.log('  favicon.ico (32x32)');

  console.log('\nDone! All icons saved to public/');
}

main().catch(console.error);
