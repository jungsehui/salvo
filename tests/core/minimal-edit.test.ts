import { describe, it, expect } from 'vitest';
import { minimalTextEdit } from '../../src/core/format/minimal-edit';

const apply = (text: string, r: { start: number; end: number; text: string }): string =>
  text.slice(0, r.start) + r.text + text.slice(r.end);

describe('minimalTextEdit', () => {
  it('returns undefined for identical text', () => {
    expect(minimalTextEdit('abc', 'abc')).toBeUndefined();
  });

  it('replaces only the differing middle', () => {
    const r = minimalTextEdit('url: "a"\ntimeout: 5000\n', 'url: "a"\ntimeout: 7000\n');
    expect(r).toEqual({ start: 18, end: 19, text: '7' });
  });

  it('handles pure insertions and deletions', () => {
    expect(minimalTextEdit('ab', 'aXb')).toEqual({ start: 1, end: 1, text: 'X' });
    expect(minimalTextEdit('aXb', 'ab')).toEqual({ start: 1, end: 2, text: '' });
  });

  it('never splits a surrogate pair', () => {
    const r = minimalTextEdit('x😀y', 'x😁y');
    expect(r).toEqual({ start: 1, end: 3, text: '😁' });
  });

  it('round-trips through apply', () => {
    for (const [a, b] of [['', 'new'], ['old', ''], ['same prefix A', 'same prefix B'], ['a\nb\nc', 'a\nB\nc\nd']] as const) {
      const r = minimalTextEdit(a, b);
      expect(r ? apply(a, r) : a).toBe(b);
    }
  });

  it('snaps both ends together when the common suffix starts with a low surrogate', () => {
    // U+1F600 and U+1FA00 share their low surrogate (DE00), so the suffix scan stops inside the pair.
    expect(minimalTextEdit('x\u{1F600}', 'x\u{1FA00}')).toEqual({ start: 1, end: 3, text: '\u{1FA00}' });
  });

  it('reproduces the new text even around lone surrogates', () => {
    for (const [a, b] of [['a', '\uD83Da'], ['\uD83Da', 'a'], ['x\uD83D', 'y\uD83D'], ['\uDE00', '😀']] as const) {
      const r = minimalTextEdit(a, b);
      expect(r ? apply(a, r) : a).toBe(b);
    }
  });
});
