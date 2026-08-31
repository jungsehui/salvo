import { parseManifest } from '../core/format/parse-manifest';
import type { SalvoManifest } from '../core/generated/salvo-manifest';
import type { ParseIssue } from '../core/types';

export interface FileSystemLike {
  /** File text, or undefined when the file does not exist. Never throws. */
  readFile(path: string): Promise<string | undefined>;
}

export interface LocatedManifest {
  dir: string;
  path: string;
  manifest: SalvoManifest;
}

const trimSlash = (p: string): string => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

export async function locateManifest(
  fs: FileSystemLike,
  fileDir: string,
  stopDir: string
): Promise<{ ok: true; found?: LocatedManifest } | { ok: false; issues: ParseIssue[] }> {
  const stop = trimSlash(stopDir);
  let dir = trimSlash(fileDir);
  for (;;) {
    const path = `${dir}/salvo.yaml`;
    const text = await fs.readFile(path);
    if (text !== undefined) {
      const parsed = parseManifest(text);
      if (!parsed.ok) {
        return { ok: false, issues: parsed.issues.map((i) => ({ ...i, message: `${path}: ${i.message}` })) };
      }
      return { ok: true, found: { dir, path, manifest: parsed.manifest } };
    }
    if (dir === stop) return { ok: true, found: undefined };
    const parent = dir.slice(0, dir.lastIndexOf('/')) || '/';
    if (parent === dir) return { ok: true, found: undefined };
    dir = parent;
  }
}

export function pickEnvironment(manifest: SalvoManifest | undefined, saved: string | undefined): string | undefined {
  const envs = manifest?.environments;
  if (!envs) return undefined;
  const names = Object.keys(envs);
  if (names.length === 0) return undefined;
  return saved !== undefined && saved in envs ? saved : names[0];
}
