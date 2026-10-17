import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { baselineGateRenumberCases } from './fixtures/gateRenumberCases';
import { idealPriceOnlySetup } from './fixtures/v3Reachability';

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/golden-b90004f.json'), 'utf8')) as {
  baseline: string;
  schema: string[];
  ideal: Array<{ id: string; result: [string, string, number | null, Array<boolean | null>, string[]] }>;
  random: Array<{ id: string; results: Array<[string, string, number | null, Array<boolean | null>, string[]]> }>;
};
assert.equal(golden.baseline, 'b90004f');
assert.deepEqual(golden.schema, ['finalAction', 'systemDecision', 'mfci', 'stagePasses', 'gateStatuses']);

const expectedById = new Map<string, [string, string, number | null, Array<boolean | null>, string[]]>();
for (const row of golden.ideal) expectedById.set(row.id, row.result);
for (const group of golden.random) group.results.forEach((result, i) => expectedById.set(`random|${group.id}|${i}`, result));
assert.equal(expectedById.size, 24_024, 'baseline covers 24 ideal plus 24,000 seeded random windows');

const gateOrder = [
  'Market Structure (S1 + S2 BOS + S3 CHoCH)',
  'Imbalance (FVG / IFVG / BPR)',
  'Order Block & Breaker',
  'Premium / Discount (OTE confluence)',
  'Wick Pushback',
  'Liquidity Sweep',
  'Momentum',
  'Session & Kill Zone',
  'BSL/SSL Target',
];
const gateCodes = ['GATE1_STRUCTURE', 'GATE2_IMBALANCE', 'GATE3_OB_BREAKER', 'GATE4_PD', 'GATE5_WICK', 'GATE6_SWEEP', 'GATE7_MOMENTUM', 'GATE8_SESSION', 'GATE9_TARGET'];
const oldGateIndexForNew = [0, 1, 2, 4, 5, 3, 6, 7, 8];
let checked = 0;

for (const testCase of baselineGateRenumberCases()) {
  const expected = expectedById.get(testCase.id);
  assert.ok(expected, `missing pre-C1 golden case ${testCase.id}`);
  const actual = evaluateStrategyV3({
    candles: testCase.candles,
    htfBias: testCase.direction,
    newsEvents: [],
    newsSourceOnline: true,
    timeframe: testCase.timeframe,
    fullModeEnabled: testCase.full,
    gate4Mode: 'A', // preserve the pre-PR-B golden baseline; PR-B is compared separately.
  });
  assert.equal(actual.finalAction, expected[0], `${testCase.id}: finalAction unchanged`);
  assert.equal(actual.systemDecision, expected[1], `${testCase.id}: systemDecision unchanged`);
  assert.equal(actual.mfci.totalMfci, expected[2], `${testCase.id}: MFCI unchanged`);
  assert.deepEqual(actual.stages.map((stage) => stage.passed), expected[3], `${testCase.id}: stage pass/fail unchanged`);
  assert.deepEqual(actual.gates.map((gate) => gate.status), oldGateIndexForNew.map((index) => expected[4][index]), `${testCase.id}: only G4/G5/G6 positions are remapped`);
  expectedById.delete(testCase.id);
  checked++;
}
assert.equal(expectedById.size, 0, 'all stored golden cases were exercised');
assert.equal(checked, 24_024);

const ideal = evaluateStrategyV3({
  candles: idealPriceOnlySetup(1.085, '15m', 'BULLISH'),
  htfBias: 'BULLISH', newsEvents: [], newsSourceOnline: true, timeframe: '15m',
});
assert.equal(ideal.gates.length, 9);
assert.deepEqual(ideal.gates.map((gate) => gate.gateNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.deepEqual(ideal.gates.map((gate) => gate.name), gateOrder);
ideal.gates.forEach((gate, index) => assert.match(gate.reason, new RegExp(`^${gateCodes[index]}:`)));
console.log(`=== GATE RENUMBER EQUIVALENCE: ${checked} b90004f decisions unchanged; G4/G5/G6 mapping and gate structure passed ===`);
