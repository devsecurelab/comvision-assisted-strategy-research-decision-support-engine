import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const productionFiles = [
  'server.ts',
  'src/App.tsx',
  'src/components/Header.tsx',
  'src/components/Sidebar.tsx',
  'src/components/views/NewsGuardView.tsx',
  'src/components/views/SettingsView.tsx',
  'src/engine/dataProviders.ts',
  'src/engine/newsGuard.ts',
  'src/engine/pipeline.ts',
  'src/engine/types.ts',
  'src/server/notificationService.ts',
  'src/server/chatService.ts',
  'src/components/docs/DocsView.tsx',
  'src/components/docs/SecurityView.tsx',
  'src/components/docs/TermsView.tsx',
  'src/components/PublicLanding.tsx',
];

for (const file of productionFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /simulate-fallback|trigger-simulated|isFallbackLive|LiveVisionStream|VisionView|REPLAY\/DEMO DATA|FAILOVER SIMULATION|vision_verification|cv_confidence|Vision Verification|Live Vision Stream|computer vision|optical character|vision stream|screen-capture|simulation controls/i, `${file} contains a removed W1b simulation/Vision surface`);
}

assert.equal(fs.existsSync(path.join(root, 'src/components/LiveVisionStream.tsx')), false);
assert.equal(fs.existsSync(path.join(root, 'src/components/views/VisionView.tsx')), false);
assert.match(read('src/engine/dataProviders.ts'), /private activeProvider: MarketDataProvider = 'TWELVE_DATA'/);
assert.doesNotMatch(read('src/engine/newsGuard.ts'), /seedDefaultEvents|triggerSimulatedRedFolderEvent/);
assert.match(read('server.ts'), /Valid providers are TWELVE_DATA and ALPHA_VANTAGE/);
assert.doesNotMatch(read('src/engine/types.ts'), /CVEvidenceSource|sVisionAi|vision_verification|cv_confidence/);
assert.doesNotMatch(read('src/server/notificationService.ts'), /Vision Verification/);
assert.doesNotMatch(read('src/components/docs/DocsView.tsx'), /Live Vision|computer vision|vision stream|simulation controls|Alpha Vantage, Replay/);

console.log('=== W1b PRODUCTION SURFACE TEST: simulation, replay selector, and Vision mock surfaces removed ===');
