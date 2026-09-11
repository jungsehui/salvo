import { describe, it, expect } from 'vitest';
import { REDACTED, redactResults, redactText } from '../../src/core/runner/redact';
import type { RunResult } from '../../src/core/types';

const result: RunResult = {
  caseIndex: 0,
  caseName: 'c',
  outcome: 'failed',
  assertions: [{ target: 'json data.token', expected: 'equals "x"', actual: '"tok-12345"', pass: false }],
  response: {
    status: 200,
    headers: { 'x-echo': 'tok-12345' },
    bodyText: '{"token":"tok-12345"}',
    json: { token: 'tok-12345', nested: ['tok-12345'] },
    durationMs: 1,
  },
  error: 'server said tok-12345',
};

describe('redact', () => {
  it('replaces every occurrence of a secret value', () => {
    expect(redactText('a tok-12345 b tok-12345', ['tok-12345'])).toBe(`a ${REDACTED} b ${REDACTED}`);
  });

  it('ignores values shorter than four characters so unrelated text survives', () => {
    expect(redactText('status 200 ok', ['200', 'ok'])).toBe('status 200 ok');
  });

  it('redacts the longer value first when one secret contains another', () => {
    expect(redactText('abcdef', ['abcd', 'abcdef'])).toBe(REDACTED);
  });

  it('walks results deeply without mutating the input', () => {
    const out = redactResults([result], ['tok-12345']);
    expect(JSON.stringify(out)).not.toContain('tok-12345');
    expect(out[0]?.response?.json).toEqual({ token: REDACTED, nested: [REDACTED] });
    expect(out[0]?.response?.headers['x-echo']).toBe(REDACTED);
    expect(out[0]?.error).toBe(`server said ${REDACTED}`);
    expect(result.error).toBe('server said tok-12345');
  });

  it('returns the same array when nothing qualifies', () => {
    const arr = [result];
    expect(redactResults(arr, ['ab'])).toBe(arr);
  });
});
