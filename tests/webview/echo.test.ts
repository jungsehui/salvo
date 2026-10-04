import { describe, it, expect } from 'vitest';
import { consumeEcho } from '../../src/webview/echo';

describe('consumeEcho', () => {
  it('consumes the matching commit and everything older', () => {
    const pending = ['a', 'b', 'c'];
    expect(consumeEcho(pending, 'b')).toBe(true);
    expect(pending).toEqual(['c']);
  });

  it('treats an unknown value as a foreign change and clears the list', () => {
    const pending = ['a'];
    expect(consumeEcho(pending, 'z')).toBe(false);
    expect(pending).toEqual([]);
  });

  it('accepts a custom matcher (the host appends a newline to block scalars)', () => {
    const pending = ['query { ok }'];
    expect(consumeEcho(pending, 'query { ok }\n', (sent, got) => got === sent || got === `${sent}\n`)).toBe(true);
    expect(pending).toEqual([]);
  });

  it('reports no echo when nothing is pending', () => {
    expect(consumeEcho([], 'x')).toBe(false);
  });
});
