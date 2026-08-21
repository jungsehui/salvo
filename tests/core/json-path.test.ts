import { describe, it, expect } from 'vitest';
import { getAtPath, parsePath } from '../../src/core/assert/json-path';

const BODY = {
  data: { me: { id: 'u1', 'weird.key': 'w' } },
  errors: [{ extensions: { code: 'UNAUTHENTICATED' } }],
  list: [1, 2, 3],
};

describe('parsePath', () => {
  it('parses dotted, indexed, and quoted segments', () => {
    expect(parsePath('errors[0].extensions.code')).toEqual({ ok: true, segments: ['errors', 0, 'extensions', 'code'] });
    expect(parsePath('data.me["weird.key"]')).toEqual({ ok: true, segments: ['data', 'me', 'weird.key'] });
  });
  it('rejects malformed paths with a message', () => {
    const r = parsePath('a[unclosed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('[');
  });
});

describe('getAtPath', () => {
  it('finds nested values', () => {
    expect(getAtPath(BODY, 'errors[0].extensions.code')).toEqual({ ok: true, found: true, value: 'UNAUTHENTICATED' });
    expect(getAtPath(BODY, 'data.me["weird.key"]')).toEqual({ ok: true, found: true, value: 'w' });
  });
  it('reports absence as found:false, not as an error', () => {
    expect(getAtPath(BODY, 'data.nothing.here')).toEqual({ ok: true, found: false });
    expect(getAtPath(BODY, 'list[9]')).toEqual({ ok: true, found: false });
  });
  it('treats an explicit null as found', () => {
    expect(getAtPath({ a: null }, 'a')).toEqual({ ok: true, found: true, value: null });
  });

  it('rejects leading, trailing, and consecutive dots', () => {
    expect(parsePath('.a').ok).toBe(false);
    expect(parsePath('a.').ok).toBe(false);
    expect(parsePath('a..b').ok).toBe(false);
  });

  it('does not walk the prototype chain', () => {
    expect(getAtPath({ a: 1 }, 'constructor')).toEqual({ ok: true, found: false });
    expect(getAtPath({ a: 1 }, '__proto__')).toEqual({ ok: true, found: false });
  });

  it('parses quoted keys containing "]"', () => {
    expect(getAtPath({ 'x]y': 1 }, '["x]y"]')).toEqual({ ok: true, found: true, value: 1 });
  });
});
