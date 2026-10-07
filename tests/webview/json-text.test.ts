import { describe, it, expect } from 'vitest';
import { formatJsonBody, normalizeJsonText } from '../../src/webview/json-text';

describe('json-text', () => {
  it('pretty-prints with two spaces', () => {
    expect(formatJsonBody({ a: 1, b: [true, null] })).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}');
    expect(formatJsonBody('x')).toBe('"x"');
  });

  it('normalizes valid JSON to the shown form so the host echo matches', () => {
    expect(normalizeJsonText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(normalizeJsonText(formatJsonBody({ x: 'y' }))).toBe(formatJsonBody({ x: 'y' }));
  });

  it('passes invalid JSON through for the host to refuse', () => {
    expect(normalizeJsonText('{ not json')).toBe('{ not json');
  });
});
