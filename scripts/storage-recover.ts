import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const [, , store, flag, source] = process.argv;
if (!store || !['--from-prev', '--from-corrupt', '--fresh'].includes(flag)) {
  console.error('Usage: npm run storage:recover -- <store> --from-prev|--from-corrupt <file>|--fresh');
  process.exit(2);
}
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const target = path.join(dataDir, `${store}.json`);
const sourcePath = flag === '--from-prev' ? `${target}.prev` : flag === '--from-corrupt' ? path.resolve(source || '') : undefined;
if (flag === '--fresh') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type FRESH ${store} to reset ${target}: `);
  rl.close();
  if (answer !== `FRESH ${store}`) throw new Error('Fresh reset not confirmed.');
  fs.writeFileSync(target, '[]\n', { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, store, mode: 'fresh', secretFree: true }));
  process.exit(0);
}
if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`Recovery source not found: ${sourcePath}`);
const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(parsed) && typeof parsed !== 'object') throw new Error('Recovery source has an unsupported JSON shape.');
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(sourcePath, target);
fs.chmodSync(target, 0o600);
console.log(JSON.stringify({ ok: true, store, mode: flag.slice(2), source: path.basename(sourcePath), secretFree: true }));
