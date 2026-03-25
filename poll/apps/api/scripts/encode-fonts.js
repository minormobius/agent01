#!/usr/bin/env node
/**
 * Converts .ttf font files to .ts modules exporting ArrayBuffers.
 * This avoids needing wrangler's [[rules]] for .ttf files, which
 * wrangler versions upload doesn't support.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, '..', 'src', 'fonts');

const fonts = [
  { file: 'roboto-mono-400.ttf', out: 'roboto-mono-400.ts' },
  { file: 'roboto-mono-700.ttf', out: 'roboto-mono-700.ts' },
];

for (const { file, out } of fonts) {
  const buf = readFileSync(join(fontsDir, file));
  const b64 = buf.toString('base64');
  const ts = `// Auto-generated from ${file} — do not edit\nconst data = Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0));\nexport default data.buffer;\n`;
  writeFileSync(join(fontsDir, out), ts);
  console.log(`Encoded ${file} → ${out} (${buf.length} bytes)`);
}
