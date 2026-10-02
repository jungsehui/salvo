import { describe, it, expect } from 'vitest';
import { Bridge } from '../../src/webview/bridge';
import type { WebviewToHost } from '../../src/shared/protocol';

describe('Bridge', () => {
  it('correlates language requests with replies by id', async () => {
    const sent: WebviewToHost[] = [];
    const b = new Bridge((m) => sent.push(m));
    const p1 = b.complete('q', { line: 0, character: 0 });
    const p2 = b.hover('q', { line: 0, character: 1 });
    const [m1, m2] = sent;
    if (m1?.type !== 'lang' || m2?.type !== 'lang') throw new Error('expected lang messages');
    expect(b.receive({ type: 'langResult', id: m2.id, op: 'hover', text: 'T' })).toBe(true);
    expect(b.receive({ type: 'langResult', id: m1.id, op: 'complete', items: [{ label: 'id' }] })).toBe(true);
    expect(await p1).toEqual([{ label: 'id' }]);
    expect(await p2).toBe('T');
  });

  it('passes non-replies through and tolerates unknown or mismatched replies', async () => {
    const b = new Bridge(() => undefined);
    expect(b.receive({ type: 'notice', level: 'info', message: 'x' })).toBe(false);
    expect(b.receive({ type: 'langResult', id: 99, op: 'lint', items: [] })).toBe(true);
    const p = b.lint('q');
    expect(b.receive({ type: 'langResult', id: 1, op: 'hover', text: 'wrong op' })).toBe(true);
    expect(await p).toEqual([]);
  });
});
