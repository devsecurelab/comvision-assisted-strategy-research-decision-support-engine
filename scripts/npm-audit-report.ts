import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type AuditAdvisory = {
  source?: number | string;
  title?: string;
  url?: string;
  severity?: string;
  range?: string;
};
type AuditVulnerability = {
  severity?: string;
  isDirect?: boolean;
  range?: string;
  via?: Array<string | AuditAdvisory>;
  nodes?: string[];
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
};
type AuditReport = {
  metadata?: { vulnerabilities?: Record<string, number> };
  vulnerabilities?: Record<string, AuditVulnerability>;
};

const root = process.cwd();
const evidenceDir = path.join(root, 'docs', 'evidence');
const date = new Date().toISOString().slice(0, 10);
const jsonPath = path.join(evidenceDir, `npm-audit-${date}.json`);
const markdownPath = path.join(evidenceDir, `npm-audit-${date}.md`);
const packageLock = fs.readFileSync(path.join(root, 'package-lock.json'));
const packageLockSha256 = crypto.createHash('sha256').update(packageLock).digest('hex');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['audit', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

let audit: AuditReport | undefined;
let rawReport: unknown;
let parseError: string | undefined;
try {
  audit = JSON.parse(result.stdout || '') as AuditReport;
  rawReport = audit;
} catch (error) {
  parseError = error instanceof Error ? error.message : String(error);
  rawReport = {
    audit_command: 'npm audit --json',
    exit_status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    parse_error: parseError,
    spawn_error: result.error?.message,
  };
}

fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(rawReport, null, 2)}\n`);

const counts = audit?.metadata?.vulnerabilities ?? {};
const vulnerabilityEntries = Object.entries(audit?.vulnerabilities ?? {}).sort(([a], [b]) => a.localeCompare(b));
const status = result.status === 0 && !parseError ? 'PASS' : 'FAIL';
const generatedAt = new Date().toISOString();
const markdown: string[] = [
  `# npm audit report — ${date}`,
  '',
  `- Generated at (UTC): ${generatedAt}`,
  '- Command: `npm audit --json`',
  `- Outcome: **${status}** (exit status ${result.status ?? 'unavailable'}${result.signal ? `, signal ${result.signal}` : ''})`,
  `- Node: \`${process.version}\`; npm: \`${process.env.npm_config_user_agent ?? 'version unavailable'}\``,
  `- ` + '`package-lock.json` SHA-256: `' + packageLockSha256 + '`',
  `- Vulnerabilities: ${counts.total ?? 'unavailable'} total; ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low, ${counts.info ?? 0} info.`,
  '',
];

if (parseError) {
  markdown.push('## Audit command/response error', '', `The npm response could not be parsed as JSON: ${parseError}.`, '', 'Raw stdout, stderr, and process status are preserved in the adjacent JSON evidence file.', '');
} else if (vulnerabilityEntries.length === 0) {
  markdown.push('No package vulnerability entries were returned by npm audit.', '');
} else {
  markdown.push('## Findings', '', '| Package | Severity | Direct | Affected range | Fix available |', '|---|---|---:|---|---|');
  for (const [name, vulnerability] of vulnerabilityEntries) {
    markdown.push(`| \`${name}\` | ${vulnerability.severity ?? 'unknown'} | ${vulnerability.isDirect ? 'yes' : 'no'} | \`${vulnerability.range ?? 'unknown'}\` | \`${JSON.stringify(vulnerability.fixAvailable ?? false)}\` |`);
  }
  for (const [name, vulnerability] of vulnerabilityEntries) {
    const advisories = (vulnerability.via ?? []).filter((item): item is AuditAdvisory => typeof item !== 'string');
    if (advisories.length === 0) continue;
    markdown.push('', `### ${name}`);
    for (const advisory of advisories) {
      const label = advisory.title ?? `Advisory ${advisory.source ?? 'unknown'}`;
      markdown.push(`- ${advisory.severity ?? vulnerability.severity ?? 'unknown'}: ${label}${advisory.url ? ` — ${advisory.url}` : ''}${advisory.range ? ` (range: \`${advisory.range}\`)` : ''}`);
    }
  }
  markdown.push('');
}

if (result.stderr?.trim()) markdown.push('## npm stderr', '', '```text', result.stderr.trim(), '```', '');
if (result.error) markdown.push('## Process error', '', `\`${result.error.message}\``, '');
markdown.push('The JSON file beside this report contains the complete npm audit response. A nonzero result is intentionally propagated so CI visibly fails rather than suppressing audit findings.', '');
fs.writeFileSync(markdownPath, `${markdown.join('\n')}\n`);
console.log(`npm audit evidence written:\n- ${path.relative(root, jsonPath)}\n- ${path.relative(root, markdownPath)}\nOutcome: ${status}; counts: ${JSON.stringify(counts)}`);

if (result.status !== 0 || parseError || result.error) process.exitCode = result.status ?? 1;
