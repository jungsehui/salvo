import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_DIR = fileURLToPath(new URL('../../src/core', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('core purity', () => {
  it('src/core never imports vscode', () => {
    const files = walk(CORE_DIR);
    expect(files.length).toBeGreaterThan(0); // guard must actually see files
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Any 'vscode' module string: static/side-effect/dynamic import and require alike.
      expect(src, `${f} references the vscode module`).not.toMatch(/['"]vscode['"]/);
    }
  });
});
