import { describe, it, expect } from 'vitest';
import { updateScalar } from '../../src/core/format/update-scalar';

const DOC = `# top comment stays
salvo: 1
request:
  # endpoint for this request
  url: "http://a.test/graphql"   # trailing comment stays
  operation: |
    query Me {
      me { id }
    }
cases:
  - name: first
    expect:
      status: 200
`;

describe('updateScalar', () => {
  it('changes one value and preserves comments, key order, and block style', () => {
    const r = updateScalar(DOC, ['cases', 0, 'expect', 'status'], 401);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('status: 401');
    expect(r.text).toContain('# top comment stays');
    expect(r.text).toContain('# endpoint for this request');
    expect(r.text).toContain('# trailing comment stays');
    expect(r.text).toContain('operation: |'); // block scalar style survives
    expect(r.text.indexOf('salvo:')).toBeLessThan(r.text.indexOf('request:')); // order survives
  });

  it('is a no-op producing identical text when the value is unchanged', () => {
    const r = updateScalar(DOC, ['salvo'], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe(DOC);
  });

  it('preserves keys unknown to the current schema (forward compatibility)', () => {
    const withUnknown = DOC + 'futureField: keep me\n';
    const r = updateScalar(withUnknown, ['cases', 0, 'expect', 'status'], 500);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('futureField: keep me');
  });

  it('fails cleanly on a missing path', () => {
    const r = updateScalar(DOC, ['cases', 5, 'name'], 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('path');
  });

  it('refuses to edit malformed YAML instead of masking the error', () => {
    const r = updateScalar('key: [unclosed', ['key'], 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('YAML errors');
  });

  it('compares values strictly: a string over a numeric scalar is a change, not a no-op', () => {
    // Contract: callers pass schema-typed values (numbers as numbers).
    // '200' !== 200, so this rewrites the scalar as a quoted string.
    const r = updateScalar('status: 200\n', ['status'], '200');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('"200"');
  });
});
