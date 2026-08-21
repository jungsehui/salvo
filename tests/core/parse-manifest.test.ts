import { describe, it, expect } from 'vitest';
import { parseManifest } from '../../src/core/format/parse-manifest';

describe('parseManifest', () => {
  it('parses environments with vars and headers', () => {
    const r = parseManifest(`salvo: 1
id: 550e8400-e29b-41d4-a716-446655440000
environments:
  local:
    vars: { baseUrl: "http://localhost:4000" }
    headers: { x-env: local }
`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.environments?.local?.vars?.baseUrl).toBe('http://localhost:4000');
      expect(r.manifest.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });

  it('rejects a manifest without id, pointing at the document root', () => {
    const r = parseManifest('salvo: 1\n');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toContain('id');
  });
});
