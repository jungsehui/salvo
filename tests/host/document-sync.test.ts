import { describe, it, expect } from 'vitest';
import { applyFieldEdit, buildDocumentView, coerceLike, EchoGuard } from '../../src/host/document-sync';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

// One space before the comment on purpose: yaml re-serializes comment spacing
// to a single space, so a fixture with wider spacing would see that
// normalization folded into the first edit's range (verified 2026-09-11).
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql" # endpoint
  headers: { auth: "Bearer {{token}}" }
  operation: |
    query { ok }
  timeoutMs: 5000
cases:
  - name: one
    vars: { token: abc, retries: 2, verbose: false }
`;

const fileOf = (text: string) => {
  const p = parseSalvoFile(text);
  if (!p.ok) throw new Error('unparsable');
  return p.file;
};

describe('coerceLike', () => {
  it('keeps the type the document already has', () => {
    expect(coerceLike(5000, '7000')).toBe(7000);
    expect(coerceLike(5000, ' 8000 ')).toBe(8000);
    expect(coerceLike(5000, 'abc')).toBe('abc');
    expect(coerceLike(false, 'true')).toBe(true);
    expect(coerceLike(false, 'yes')).toBe('yes');
    expect(coerceLike('42', '43')).toBe('43');
    expect(coerceLike(null, 'x')).toBe('x');
  });
});

describe('applyFieldEdit', () => {
  it('rewrites one scalar as a minimal range edit and keeps comments', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['request', 'timeoutMs'], value: '7000' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.replace).toEqual({ start: DOC.indexOf('5000'), end: DOC.indexOf('5000') + 1, text: '7' });
    expect(r.text).toContain('# endpoint');
    expect(fileOf(r.text).request.timeoutMs).toBe(7000);
  });

  it('coerces case vars by their current type', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['cases', 0, 'vars', 'verbose'], value: 'true' });
    expect(r.ok && fileOf(r.text).cases?.[0]?.vars?.['verbose']).toBe(true);
  });

  it('is a no-op without a replacement when the value is unchanged', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['request', 'url'], value: 'http://x.test/graphql' });
    expect(r).toEqual({ ok: true, text: DOC });
  });

  it('keeps the | block style when the new operation lacks a trailing newline', () => {
    const r = applyFieldEdit(DOC, { kind: 'operation', text: 'query { me { id } }' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('operation: |\n    query { me { id } }\n');
    expect(r.text).not.toContain('|-');
    expect(fileOf(r.text).request.operation).toBe('query { me { id } }\n');
  });

  it('routes structural edits', () => {
    const added = applyFieldEdit(DOC, { kind: 'appendCase', name: 'two' });
    expect(added.ok && fileOf(added.text).cases?.map((c) => c.name)).toEqual(['one', 'two']);
    const removed = applyFieldEdit(DOC, { kind: 'removeCase', index: 0 });
    expect(removed.ok && fileOf(removed.text).cases).toEqual([]);
  });

  it('refuses to edit a document that does not parse', () => {
    const r = applyFieldEdit('salvo: 1\nrequest: [unclosed', { kind: 'scalar', path: ['request', 'url'], value: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Fix the errors');
  });

  it('stays editable when the YAML is well-formed but fails the schema, so the form can repair it', () => {
    const bad = DOC.replace('- name: one', '- name: ""');
    const r = applyFieldEdit(bad, { kind: 'scalar', path: ['cases', 0, 'name'], value: 'one' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(fileOf(r.text).cases?.[0]?.name).toBe('one');
  });

  it('refuses to turn a number or a boolean into a string', () => {
    expect(applyFieldEdit(DOC, { kind: 'scalar', path: ['request', 'timeoutMs'], value: 'abc' })).toEqual({
      ok: false,
      error: 'request.timeoutMs holds a number. Enter a number, or change its type in the text editor.',
    });
    expect(applyFieldEdit(DOC, { kind: 'scalar', path: ['cases', 0, 'vars', 'verbose'], value: 'maybe' })).toEqual({
      ok: false,
      error: 'cases.0.vars.verbose holds true or false. Enter true or false, or change its type in the text editor.',
    });
  });
});

describe('buildDocumentView', () => {
  it('wraps parse success and failure', () => {
    expect(buildDocumentView(DOC).ok).toBe(true);
    const broken = buildDocumentView('salvo: 1\n');
    expect(broken.ok).toBe(false);
    expect(broken.issues.length).toBeGreaterThan(0);
  });
});

describe('EchoGuard', () => {
  it('matches the marked text exactly once and treats anything else as foreign', () => {
    const g = new EchoGuard();
    g.markOwn('A');
    expect(g.isEcho('A')).toBe(true);
    expect(g.isEcho('A')).toBe(false);
    g.markOwn('A');
    expect(g.isEcho('B')).toBe(false);
    expect(g.isEcho('A')).toBe(false);
  });
});
