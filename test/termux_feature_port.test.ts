import assert from 'node:assert/strict';
import { DEFAULT_PAIR, MAJOR_PAIRS, MINOR_CROSS_PAIRS, SUPPORTED_PAIRS, isSupportedPair, normalizePair } from '../src/engine/pairCatalog';

const tests: Array<[string, () => void]> = [
  ['Pair catalog contains exactly 40 canonical pairs', () => assert.equal(SUPPORTED_PAIRS.length, 40)],
  ['Major category contains exactly 20 pairs', () => assert.equal(MAJOR_PAIRS.length, 20)],
  ['Minor/cross category contains exactly 20 pairs', () => assert.equal(MINOR_CROSS_PAIRS.length, 20)],
  ['Default pair is EUR/USD', () => assert.equal(DEFAULT_PAIR, 'EUR/USD')],
  ['Pair normalization is trim and case insensitive', () => assert.equal(normalizePair(' usd/jpy '), 'USD/JPY')],
  ['Unsupported crypto pair is rejected', () => assert.equal(isSupportedPair('BTC/USD'), false)],
  ['Unsupported pair normalization throws', () => assert.throws(() => normalizePair('XAU/USD'), /Unsupported symbol/)],
  ['All canonical pairs normalize to themselves', () => SUPPORTED_PAIRS.forEach((pair) => assert.equal(normalizePair(pair.toLowerCase()), pair))],
  ['Major and minor categories do not overlap', () => assert.equal(MAJOR_PAIRS.filter((pair) => new Set<string>(MINOR_CROSS_PAIRS as readonly string[]).has(pair)).length, 0)],
  ['Catalog has no duplicates', () => assert.equal(new Set(SUPPORTED_PAIRS).size, SUPPORTED_PAIRS.length)],
];

for (const [name, run] of tests) {
  run();
  console.log(`[PASS] Termux feature port: ${name}`);
}
console.log(`=== TERMUX FEATURE PORT: ${tests.length} PASSED, 0 FAILED ===`);
