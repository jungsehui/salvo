import { describe, it, expect } from 'vitest';
import { locateManifest, pickEnvironment, type FileSystemLike } from '../../src/host/manifest-locator';

const MANIFEST = 'salvo: 1\nid: proj-12345678\nenvironments:\n  dev: { vars: { baseUrl: "http://d" } }\n  prod: { vars: { baseUrl: "http://p" } }\n';
const fsOf = (map: Record<string, string>): FileSystemLike => ({ readFile: async (p) => map[p] });

describe('locateManifest', () => {
  it('finds the nearest salvo.yaml walking up to stopDir', async () => {
    const fs = fsOf({ '/w/api/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/w/api/requests/auth', '/w');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.found?.dir).toBe('/w/api');
      expect(r.found?.manifest.id).toBe('proj-12345678');
    }
  });

  it('prefers the closest manifest over an ancestor one', async () => {
    const fs = fsOf({ '/w/salvo.yaml': MANIFEST, '/w/api/salvo.yaml': MANIFEST.replace('proj-12345678', 'proj-inner-99') });
    const r = await locateManifest(fs, '/w/api', '/w');
    expect(r.ok && r.found?.manifest.id).toBe('proj-inner-99');
  });

  it('returns found: undefined when nothing exists up to stopDir', async () => {
    const r = await locateManifest(fsOf({}), '/w/api', '/w');
    expect(r).toEqual({ ok: true, found: undefined });
  });

  it('does not walk above stopDir', async () => {
    const fs = fsOf({ '/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/w/api', '/w');
    expect(r).toEqual({ ok: true, found: undefined });
  });

  it('finds a manifest at the filesystem root without a double slash', async () => {
    const fs = fsOf({ '/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/', '/');
    expect(r.ok && r.found?.path).toBe('/salvo.yaml');
  });

  it('surfaces a broken manifest as issues with the path in the message', async () => {
    const fs = fsOf({ '/w/salvo.yaml': 'salvo: 1\n' });
    const r = await locateManifest(fs, '/w', '/w');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('/w/salvo.yaml');
  });
});

describe('pickEnvironment', () => {
  const manifest = { salvo: 1 as const, id: 'proj-12345678', environments: { dev: {}, prod: {} } };
  it('keeps a saved name when it still exists', () => {
    expect(pickEnvironment(manifest, 'prod')).toBe('prod');
  });
  it('falls back to the first defined environment', () => {
    expect(pickEnvironment(manifest, 'gone')).toBe('dev');
    expect(pickEnvironment(manifest, undefined)).toBe('dev');
  });
  it('ignores prototype-chain names as saved environments', () => {
    expect(pickEnvironment(manifest, 'constructor')).toBe('dev');
  });
  it('returns undefined without a manifest or environments', () => {
    expect(pickEnvironment(undefined, 'dev')).toBeUndefined();
    expect(pickEnvironment({ salvo: 1, id: 'proj-12345678' }, 'dev')).toBeUndefined();
  });
});
