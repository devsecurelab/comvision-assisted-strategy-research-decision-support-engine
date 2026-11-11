import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readLegacyOptional } from '../src/engine/legacyTelemetry';

const root = process.cwd();
const pipeline = fs.readFileSync(path.join(root, 'src/engine/pipeline.ts'), 'utf8');
const analytics = fs.readFileSync(path.join(root, 'src/server/analyticsService.ts'), 'utf8');

assert.doesNotMatch(pipeline, /customSettings\??:/, 'unused customSettings input must be removed from PipelineInput');
assert.doesNotMatch(pipeline, /liveTickPressure\??:/, 'unused liveTickPressure input must be removed from PipelineInput');
assert.doesNotMatch(pipeline, /input\.customSettings|input\.liveTickPressure/, 'removed inputs must not affect pipeline output');
assert.match(pipeline, /decision_engine_v3:\s*v3Telemetry/, 'V3 telemetry remains the authoritative source');

assert.equal(readLegacyOptional({ userAction: 'TAKEN' }, 'userAction'), 'TAKEN');
assert.equal(readLegacyOptional({ outcome: 'WIN' }, 'outcome'), 'WIN');
assert.equal(readLegacyOptional({ nextCandleOpen: 1.1 }, 'nextCandleOpen'), 1.1);
assert.equal(readLegacyOptional({ userAction: undefined }, 'userAction'), undefined);
assert.match(analytics, /readLegacyOptional/, 'analytics must use the centralized backward-read helper');

console.log('=== PR-8 LEGACY READ/INPUT RED-GREEN: legacy optional reads preserved; unused pipeline inputs removed ===');
