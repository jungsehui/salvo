import { describe, it, expect } from 'vitest';
import { isWebviewMessage } from '../../src/shared/protocol';

describe('isWebviewMessage (HTTP editing)', () => {
  it('accepts setMethod with a known method and editJsonBody with text', () => {
    expect(isWebviewMessage({ type: 'setMethod', method: 'PATCH' })).toBe(true);
    expect(isWebviewMessage({ type: 'editJsonBody', text: '{}' })).toBe(true);
  });

  it('rejects unknown methods and non-string bodies', () => {
    expect(isWebviewMessage({ type: 'setMethod', method: 'patch' })).toBe(false);
    expect(isWebviewMessage({ type: 'setMethod' })).toBe(false);
    expect(isWebviewMessage({ type: 'editJsonBody', text: 1 })).toBe(false);
  });
});
