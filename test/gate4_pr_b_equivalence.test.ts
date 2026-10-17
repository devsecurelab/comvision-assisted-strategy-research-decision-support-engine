import assert from 'node:assert/strict';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { baselineGateRenumberCases } from './fixtures/gateRenumberCases';

let checked = 0; let changed = 0; let passToBlocked = 0; let blockedToPass = 0;
for (const testCase of baselineGateRenumberCases()) {
  const common = { candles: testCase.candles, htfBias: testCase.direction, newsEvents: [], newsSourceOnline: true, timeframe: testCase.timeframe, fullModeEnabled: testCase.full };
  const a = evaluateStrategyV3({ ...common, gate4Mode: 'A' });
  const b = evaluateStrategyV3({ ...common, gate4Mode: 'B' });
  assert.deepEqual(b.gates.map((g) => g.status).filter((_, i) => i !== 3), a.gates.map((g) => g.status).filter((_, i) => i !== 3), `${testCase.id}: non-G4 gates changed`);
  assert.deepEqual(b.mfci, a.mfci, `${testCase.id}: MFCI changed`);
  assert.deepEqual(b.stages.map((s) => s.passed).filter((_, i) => i !== 11), a.stages.map((s) => s.passed).filter((_, i) => i !== 11), `${testCase.id}: non-G4 stage pass/fail changed`);
  if (a.gates[3].status !== b.gates[3].status) {
    changed++;
    if (a.gates[3].status === 'PASS' && b.gates[3].status === 'BLOCKED') passToBlocked++;
    if (a.gates[3].status === 'BLOCKED' && b.gates[3].status === 'PASS') blockedToPass++;
  }
  if (a.gates[3].status === 'PASS' && b.gates[3].status === 'PASS') {
    assert.equal(b.finalAction, a.finalAction, `${testCase.id}: action changed while G4 remained PASS`);
    assert.equal(b.systemDecision, a.systemDecision, `${testCase.id}: decision changed while G4 remained PASS`);
  }
  checked++;
}
assert.equal(checked, 24_024);
console.log(`=== PR-B G4 GOLDEN PARITY: ${checked} cases; changed=${changed}; PASS->BLOCKED=${passToBlocked}; BLOCKED->PASS=${blockedToPass}; non-G4 gates/stages/MFCI unchanged ===`);
