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
  'src/server/chatService.ts',
];

for (const file of productionFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /simulate-fallback|trigger-simulated|isFallbackLive|LiveVisionStream|VisionView|REPLAY\/DEMO DATA|FAILOVER SIMULATION/i, `${file} contains a removed W1b simulation/Vision surface`);
}

assert.equal(fs.existsSync(path.join(root, 'src/components/LiveVisionStream.tsx')), false);
assert.equal(fs.existsSync(path.join(root, 'src/components/views/VisionView.tsx')), false);
assert.match(read('src/engine/dataProviders.ts'), /private activeProvider: MarketDataProvider = 'TWELVE_DATA'/);
assert.doesNotMatch(read('src/engine/newsGuard.ts'), /seedDefaultEvents|triggerSimulatedRedFolderEvent/);
assert.match(read('server.ts'), /Valid providers are TWELVE_DATA and ALPHA_VANTAGE/);

console.log('=== W1b PRODUCTION SURFACE TEST: simulation, replay selector, and Vision mock surfaces removed ===');
