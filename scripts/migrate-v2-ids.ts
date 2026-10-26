import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

type Candidate = { metadata?: { setup_id?: string; timestamp_utc?: string; [key: string]: unknown }; [key: string]: unknown };

const args = new Set(process.argv.slice(2));
const valueOf = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const dataDir = valueOf('--data-dir', process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const input = valueOf('--input', path.join(dataDir, 'candidates.json'));
const archiveDir = valueOf('--archive-dir', path.join(dataDir, 'archive'));
const apply = args.has('--apply');

if (!fs.existsSync(input)) {
  console.log(JSON.stringify({ dryRun: !apply, input, candidates: 0, migrated: 0, message: 'No candidates file; nothing to migrate.' }));
  process.exit(0);
}
const candidates = JSON.parse(fs.readFileSync(input, 'utf8')) as Candidate[];
if (!Array.isArray(candidates)) throw new Error('MIGRATION_INPUT_INVALID: candidates.json must contain an array.');

const mapping: Record<string, string> = {};
const migrated = candidates.map((candidate) => {
  const oldId = candidate.metadata?.setup_id;
  if (typeof oldId !== 'string' || !oldId.startsWith('V2-')) return candidate;
  const seed = `${oldId}|${candidate.metadata?.timestamp_utc || ''}`;
  const newId = `V3-${createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
  mapping[oldId] = newId;
  return { ...candidate, metadata: { ...candidate.metadata, setup_id: newId, legacy_setup_id: oldId } };
});

const summary = { dryRun: !apply, input, candidates: candidates.length, migrated: Object.keys(mapping).length, mapping };
if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archivePath = path.join(archiveDir, `candidates-v2-${stamp}.json.gz`);
const mapPath = path.join(archiveDir, `v2-id-map-${stamp}.json`);
fs.writeFileSync(archivePath, zlib.gzipSync(fs.readFileSync(input)));
fs.chmodSync(archivePath, 0o444);
fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2) + '\n');
fs.chmodSync(mapPath, 0o444);
const tmp = `${input}.migration.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(migrated, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, input);
console.log(JSON.stringify({ ...summary, archivePath, mapPath, applied: true }, null, 2));
