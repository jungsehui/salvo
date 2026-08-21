import { describe, it, expect } from 'vitest';
import { evaluateExpect } from '../../src/core/assert/evaluate-expect';
import type { Expect } from '../../src/core/generated/salvo-file';
import type { HttpResponse } from '../../src/core/types';

const resp = (over: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  bodyText: '',
  json: { data: { me: { id: 'u1' } }, items: ['a', 'b'] },
  durationMs: 5,
  ...over,
});

describe('evaluateExpect', () => {
  it('checks literal status and range status', () => {
    expect(evaluateExpect({ status: 200 }, resp())[0]?.pass).toBe(true);
    expect(evaluateExpect({ status: '2xx' }, resp())[0]?.pass).toBe(true);
    expect(evaluateExpect({ status: '4xx' }, resp())[0]?.pass).toBe(false);
  });

  it('defaults to an implicit 2xx assertion when expect is absent', () => {
    const a = evaluateExpect(undefined, resp({ status: 500 }));
    expect(a).toHaveLength(1);
    expect(a[0]?.pass).toBe(false);
    expect(a[0]?.target).toBe('status');
  });

  it('matches headers case-insensitively', () => {
    const a = evaluateExpect({ headers: { 'Content-Type': { contains: 'json' } } }, resp());
    expect(a[0]?.pass).toBe(true);
  });

  it('runs all six matchers on json paths', () => {
    const e: Expect = {
      json: {
        'data.me.id': 'u1',                     // literal equals
        errors: { exists: false },              // exists
        items: { length: 2 },                   // length
        'items[0]': { oneOf: ['a', 'z'] },      // oneOf
        'data.me': { contains: 'id' },          // contains on a non-string fails politely
      },
    };
    const a = evaluateExpect(e, resp());
    const byTarget = Object.fromEntries(a.map((x) => [x.target, x]));
    expect(byTarget['json data.me.id']?.pass).toBe(true);
    expect(byTarget['json errors']?.pass).toBe(true);
    expect(byTarget['json items']?.pass).toBe(true);
    expect(byTarget['json items[0]']?.pass).toBe(true);
    expect(byTarget['json data.me']?.pass).toBe(false);
    expect(byTarget['json data.me']?.actual).toContain('not a string or array');
  });

  it('matches regex and reports the pattern in expected', () => {
    const a = evaluateExpect({ json: { 'data.me.id': { matches: '^u\\d+$' } } }, resp());
    expect(a[0]?.pass).toBe(true);
    expect(a[0]?.expected).toContain('^u\\d+$');
  });

  it('fails json assertions with a clear actual when the body is not JSON', () => {
    const a = evaluateExpect({ json: { 'data.x': { exists: true } } }, resp({ json: undefined, bodyText: '<html>' }));
    expect(a[0]?.pass).toBe(false);
    expect(a[0]?.actual).toContain('not valid JSON');
  });
});
