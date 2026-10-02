import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const VSCODE_FREE = ['../../src/core', '../../src/host', '../../src/shared', '../../src/webview'].map(dir);
const BROWSER_ONLY = ['../../src/shared', '../../src/webview'].map(dir);

function walk(d: string): string[] {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const scan = (dirs: string[], check: (file: string, src: string) => void): void => {
  const present = dirs.filter((d) => existsSync(d));
  expect(present.length, 'no guarded directories found').toBe(dirs.length);
  for (const d of present) {
    const files = walk(d);
    expect(files.length, `${d} has no files to scan`).toBeGreaterThan(0);
    for (const f of files) check(f, readFileSync(f, 'utf8'));
  }
};

describe('module purity', () => {
  it('core, host, shared, and webview never reference the vscode module', () => {
    // Any 'vscode' module string: static/side-effect/dynamic import and require alike.
    scan(VSCODE_FREE, (f, src) => expect(src, `${f} references the vscode module`).not.toMatch(/['"]vscode['"]/));
  });

  it('shared and webview stay browser-only: no node, no parsers, no core/host values, no inline styles', () => {
    scan(BROWSER_ONLY, (f, src) => {
      expect(src, `${f} imports a node builtin`).not.toMatch(/from\s+['"]node:/);
      expect(src, `${f} imports a host-only package`).not.toMatch(/from\s+['"](yaml|ajv|graphql|graphql-language-service)['"]/);
      for (const line of src.split('\n')) {
        if (/from\s+['"]\.\.\/(core|host)\//.test(line) || /from\s+['"]\.\.\/\.\.\/(core|host)\//.test(line)) {
          expect(line.trimStart(), `${f} imports a value from core/host: ${line.trim()}`).toMatch(/^import type /);
        }
      }
      if (f.endsWith('.tsx')) expect(src, `${f} uses an inline style prop (blocked by CSP)`).not.toContain('style={{');
    });
  });
});
