import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type Candidate = { metadata?: { setup_id?: string; prev_hash?: string; sha256_hash?: string }; [key: string]: unknown };
const valueOf = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const file = valueOf('--file', path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'candidates.json'));
if (!fs.existsSync(file)) throw new Error(`LEGACY_CHAIN_FILE_NOT_FOUND: ${file}`);
const bytes = fs.readFileSync(file);
const raw = file.endsWith('.gz') ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
const records = JSON.parse(raw) as Candidate[];
if (!Array.isArray(records)) throw new Error('LEGACY_CHAIN_INVALID: expected a candidate array.');
const firstPrev = records[0]?.metadata?.prev_hash;
const chronological = firstPrev === '0'.repeat(64) ? records : [...records].reverse();
let expectedPrev = '0'.repeat(64);
const errors: string[] = [];
const ids = new Set<string>();
for (const [index, record] of chronological.entries()) {
  const id = record.metadata?.setup_id;
  if (!id) errors.push(`record ${index}: missing setup_id`);
  if (id && ids.has(id)) errors.push(`record ${index}: duplicate setup_id ${id}`);
  if (id) ids.add(id);
  if (record.metadata?.prev_hash !== undefined && record.metadata.prev_hash !== expectedPrev) errors.push(`record ${index}: prev_hash mismatch`);
  if (!record.metadata?.sha256_hash) errors.push(`record ${index}: missing sha256_hash`);
  if (record.metadata?.sha256_hash) expectedPrev = record.metadata.sha256_hash;
}
const result = { file, records: records.length, ok: errors.length === 0, errors };
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
