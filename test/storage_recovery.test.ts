import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableStorage } from '../src/server/storage';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-storage-red-'));
const failures: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) failures.push(message); };
const corruptFiles = (dir: string, name: string) => fs.readdirSync(dir).filter((file) => file.startsWith(`${name}.corrupt.`));

try {
  const criticalDir = path.join(tempRoot, 'critical-users');
  const critical = new DurableStorage(criticalDir);
  const usersPath = path.join(criticalDir, 'users.json');
  const brokenBytes = Buffer.from('{"users": [broken-json');
  fs.writeFileSync(usersPath, brokenBytes);
  try { critical.loadUsers(); } catch { /* a throwing read is acceptable if the original is preserved and quarantined */ }
  check(corruptFiles(criticalDir, 'users.json').length === 1, 'corrupt users.json must be quarantined with a UTC suffix');
  check(fs.existsSync(usersPath) && fs.readFileSync(usersPath).equals(brokenBytes), 'corrupt original bytes must remain unchanged and the source file must not be overwritten');
  const quarantinedPath = path.join(criticalDir, corruptFiles(criticalDir, 'users.json')[0] ?? 'missing');
  if (fs.existsSync(quarantinedPath)) check((fs.statSync(quarantinedPath).mode & 0o777) === 0o600, 'quarantine file permissions must be 0600');

  const zeroDir = path.join(tempRoot, 'zero-byte');
  const zero = new DurableStorage(zeroDir);
  fs.writeFileSync(path.join(zeroDir, 'users.json'), Buffer.alloc(0));
  try { zero.loadUsers(); } catch { /* expected corrupt input */ }
  check(corruptFiles(zeroDir, 'users.json').length === 1, 'zero-byte JSON file must be treated as corrupt and quarantined');

  const wrongTypeDir = path.join(tempRoot, 'wrong-type');
  const wrongType = new DurableStorage(wrongTypeDir);
  fs.writeFileSync(path.join(wrongTypeDir, 'users.json'), JSON.stringify({ id: 'not-an-array' }));
  try { wrongType.loadUsers(); } catch { /* expected type validation failure */ }
  check(corruptFiles(wrongTypeDir, 'users.json').length === 1, 'object where an array is required must be treated as corrupt');

  const firstBootDir = path.join(tempRoot, 'first-boot');
  const firstBoot = new DurableStorage(firstBootDir);
  assert.deepEqual(firstBoot.loadUsers(), [], 'ENOENT on first boot should initialize an empty user list');
  check(corruptFiles(firstBootDir, 'users.json').length === 0, 'ENOENT must not be quarantined as corruption');

  const lowPriorityDir = path.join(tempRoot, 'low-priority');
  const lowPriority = new DurableStorage(lowPriorityDir);
  const chatPath = path.join(lowPriorityDir, 'chat_history.json');
  const chatBytes = Buffer.from('{not-json');
  fs.writeFileSync(chatPath, chatBytes);
  try { assert.deepEqual(lowPriority.loadChatHistory(), []); } catch { /* quarantine and empty-start contract */ }
  check(corruptFiles(lowPriorityDir, 'chat_history.json').length === 1, 'corrupt non-critical chat history must be quarantined');
  check(fs.existsSync(chatPath) && fs.readFileSync(chatPath).equals(chatBytes), 'non-critical corrupt original must also be preserved byte-for-byte');

  const recoveryDir = path.join(tempRoot, 'prev-recovery');
  const recovery = new DurableStorage(recoveryDir);
  fs.writeFileSync(path.join(recoveryDir, 'users.json'), '{broken');
  fs.writeFileSync(path.join(recoveryDir, 'users.json.prev'), JSON.stringify([{ id: 'recovered-user' }]));
  let recovered: any[] = [];
  try { recovered = recovery.loadUsers() as any[]; } catch { /* a recovery failure should be surfaced */ }
  check(Array.isArray(recovered) && recovered[0]?.id === 'recovered-user', 'valid .prev must be automatically recovered before returning users');

  const writeDir = path.join(tempRoot, 'write-backup');
  const writeStore = new DurableStorage(writeDir);
  writeStore.saveUsers([{ id: 'original' }] as any);
  writeStore.saveUsers([{ id: 'updated' }] as any);
  const prevPath = path.join(writeDir, 'users.json.prev');
  check(fs.existsSync(prevPath), 'successful replacement must keep the prior file as users.json.prev');
  if (fs.existsSync(prevPath)) check(JSON.parse(fs.readFileSync(prevPath, 'utf8'))[0]?.id === 'original', '.prev must contain the previous valid JSON');

  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { scripts?: Record<string, string> };
  check(Boolean(packageJson.scripts?.['storage:recover']), 'package scripts must expose the explicit local storage:recover command');
  const server = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  check(!/app\.(?:get|post|put|delete)\(['"]\/api\/.*recover/i.test(server), 'storage recovery must not be exposed through a remote/API route');
  const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');
  for (const pattern of ['data/*', '!data/.gitkeep', '*.corrupt.*', '*.prev', '*.tmp.*']) {
    check(gitignore.includes(pattern), `.gitignore must protect recovery artifacts: ${pattern}`);
  }

  if (failures.length) {
    console.error(`PR-S intentional red tests: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`- ${failure}`);
    throw new Error('Storage recovery red tests failed as expected before implementation.');
  }
  console.log('=== PR-S STORAGE RECOVERY RED TESTS: quarantine, no data loss, .prev, type validation and local recovery command ===');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
