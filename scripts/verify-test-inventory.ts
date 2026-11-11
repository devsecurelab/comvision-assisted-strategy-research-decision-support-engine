import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
const testCommand = [scripts.test, scripts['test:gate-renumber']].filter(Boolean).join('\n');
const ignoredDirectories = new Set(['.git', 'node_modules', 'build', 'dist', 'coverage']);

function collectTestFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : collectTestFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [absolutePath] : [];
  });
}

const allTests = collectTestFiles(root).map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
const missing = allTests.filter((file) => !testCommand.includes(file));
const testDirectories = [...new Set(allTests.map((file) => path.posix.dirname(file)))].sort();

if (missing.length > 0) {
  console.error(`Test inventory failed: ${missing.length} .test.ts file(s) are not in npm test or test:gate-renumber:`);
  for (const file of missing) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(`[test-inventory] PASS: all ${allTests.length} repository .test.ts files across ${testDirectories.length} test director${testDirectories.length === 1 ? 'y' : 'ies'} are included.`);
  console.log(`[test-inventory] Directories: ${testDirectories.join(', ')}`);
  console.log('[test-inventory] Only dependency/generated directories (.git, node_modules, build, dist, coverage) are excluded from scanning; fixture files are not test suites.');
}
