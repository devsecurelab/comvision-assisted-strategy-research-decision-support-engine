import fs from 'node:fs';
import path from 'node:path';

/** Resolve a repository-owned config file without relying on import.meta or the caller's cwd. */
export function resolveRepositoryConfigPath(fileName: string, configuredPath?: string): string {
  if (configuredPath?.trim()) {
    const configured = configuredPath.trim();
    if (path.isAbsolute(configured)) return configured;
    const root = resolveRepositoryRoot(fileName);
    return path.resolve(root, configured);
  }
  return path.join(resolveRepositoryRoot(fileName), 'config', fileName);
}

export function resolveRepositoryRoot(fileName?: string): string {
  const starts = [
    process.env.APP_ROOT,
    process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : undefined,
    process.cwd(),
  ].filter((value): value is string => Boolean(value));
  for (const start of starts) {
    let current = path.resolve(start);
    for (let depth = 0; depth <= 8; depth++) {
      const hasRequestedFile = fileName
        ? fs.existsSync(path.join(current, 'config', fileName))
        : fs.existsSync(path.join(current, 'config', 'sessions.json')) && fs.existsSync(path.join(current, 'config', 'market-calendar.json'));
      if (hasRequestedFile) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  // Preserve a deterministic expected path so the consumer can emit its own safe load error.
  const fallback = process.env.APP_ROOT || process.cwd();
  return path.resolve(fallback);
}
