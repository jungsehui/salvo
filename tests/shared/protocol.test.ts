import { describe, it, expect } from 'vitest';
import { isWebviewMessage } from '../../src/shared/protocol';

describe('isWebviewMessage', () => {
  it('accepts every well-formed message', () => {
    for (const m of [
      { type: 'ready' },
      { type: 'edit', path: ['request', 'url'], value: 'x' },
      { type: 'edit', path: ['cases', 0, 'vars', 'token'], value: '' },
      { type: 'editOperation', text: 'query { ok }' },
      { type: 'appendCase', name: 'n' },
      { type: 'removeCase', index: 0 },
      { type: 'run', selected: 'all' },
      { type: 'run', selected: [0, 2] },
      { type: 'selectEnvironment', name: 'dev' },
      { type: 'lang', id: 1, op: 'lint', text: 'q' },
      { type: 'lang', id: 2, op: 'complete', text: 'q', pos: { line: 0, character: 0 } },
      { type: 'lang', id: 3, op: 'hover', text: 'q', pos: { line: 1, character: 4 } },
    ]) {
      expect(isWebviewMessage(m), JSON.stringify(m)).toBe(true);
    }
  });

  it('rejects malformed, foreign, and hostile shapes', () => {
    for (const m of [
      null, 'ready', {}, { type: 'nope' },
      { type: 'edit', path: [], value: 'x' },
      { type: 'edit', path: ['a', -1], value: 'x' },
      { type: 'edit', path: ['a'], value: 1 },
      { type: 'removeCase', index: -1 },
      { type: 'removeCase', index: 1.5 },
      { type: 'run', selected: ['0'] },
      { type: 'lang', id: 'x', op: 'lint', text: 'q' },
      { type: 'lang', id: 1, op: 'complete', text: 'q' },
      { type: 'lang', id: 1, op: 'complete', text: 'q', pos: { line: -1, character: 0 } },
      { type: 'lang', id: 1, op: 'explode', text: 'q' },
    ]) {
      expect(isWebviewMessage(m), JSON.stringify(m)).toBe(false);
    }
  });
});
