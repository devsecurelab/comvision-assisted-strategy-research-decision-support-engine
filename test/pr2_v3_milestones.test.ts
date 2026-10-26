import assert from 'node:assert/strict';
import { MILESTONE_NOTIFY_AT, milestonesToNotify } from '../src/engine/milestones';

assert.deepEqual([...MILESTONE_NOTIFY_AT], [100, 200, 300, 500]);
assert.deepEqual(milestonesToNotify(99, 101), [100]);
assert.deepEqual(milestonesToNotify(100, 500), [200, 300, 500]);
assert.deepEqual(milestonesToNotify(0, 500, [100, 300]), [200, 500]);
assert.deepEqual(milestonesToNotify(500, 999), []);
console.log('[pr2_v3_milestones] PASS');
