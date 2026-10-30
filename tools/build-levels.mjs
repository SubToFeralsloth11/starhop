// Generate all 200 campaign levels into data/levels.json (run: npm run levels).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLevel } from '../js/levels.js';
import { LEVELS_PER_WORLD, WORLDS } from '../js/worlds.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildAll() {
  const levels = [];
  for (let w = 1; w <= WORLDS.length; w++) {
    for (let i = 1; i <= LEVELS_PER_WORLD; i++) levels.push(generateLevel(w, i));
  }
  return levels;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  const levels = buildAll();
  const out = join(root, 'data', 'levels.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ version: 1, levels }) + '\n');
  console.log(`wrote ${levels.length} levels to ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
