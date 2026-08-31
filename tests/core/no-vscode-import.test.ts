import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARDED_DIRS = ['../../src/core', '../../src/host'].map((p) => fileURLToPath(new URL(p, import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('core purity', () => {
  it('src/core and src/host never import vscode', () => {
    const files = GUARDED_DIRS.filter((d) => existsSync(d)).flatMap((d) => walk(d));
    expect(files.length).toBeGreaterThan(0); // guard must actually see files
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Any 'vscode' module string: static/side-effect/dynamic import and require alike.
      expect(src, `${f} references the vscode module`).not.toMatch(/['"]vscode['"]/);
    }
  });
});
