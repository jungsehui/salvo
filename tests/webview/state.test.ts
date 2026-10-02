import { describe, it, expect } from 'vitest';
import { dismissNotice, initialState, modelOf, reduce, selectCase } from '../../src/webview/state';
import type { EditorSnapshot } from '../../src/shared/protocol';

const good: EditorSnapshot = {
  view: { ok: true, file: { salvo: 1, request: { url: 'u', operation: 'q' }, cases: [{ name: 'a' }, { name: 'b' }] }, issues: [] },
  envNames: ['dev'],
  envName: 'dev',
  schema: 'ready',
  running: false,
};
const broken: EditorSnapshot = { ...good, view: { ok: false, issues: [{ message: 'bad indent', line: 4, col: 1, severity: 'error' }] } };

describe('webview state', () => {
  it('adopts a parsed snapshot as the last good model', () => {
    const s = reduce(initialState, { type: 'state', snapshot: good });
    expect(modelOf(s)?.file.cases?.length).toBe(2);
    expect(s.banner).toBeUndefined();
  });

  it('keeps the last good model and raises a banner while the text is broken', () => {
    const s = reduce(reduce(initialState, { type: 'state', snapshot: good }), { type: 'state', snapshot: broken });
    expect(s.banner).toBe('Line 4: bad indent');
    expect(modelOf(s)?.file.cases?.length).toBe(2);
    expect(s.snapshot?.view.ok).toBe(false);
  });

  it('clamps the selected case when cases disappear', () => {
    const s = selectCase(reduce(initialState, { type: 'state', snapshot: good }), 1);
    const fewer: EditorSnapshot = { ...good, view: { ok: true, file: { salvo: 1, request: { url: 'u', operation: 'q' }, cases: [{ name: 'a' }] }, issues: [] } };
    expect(reduce(s, { type: 'state', snapshot: fewer }).selectedCase).toBe(0);
  });

  it('stores and dismisses notices and ignores language replies', () => {
    const s = reduce(initialState, { type: 'notice', level: 'error', message: 'nope' });
    expect(s.notice).toEqual({ level: 'error', message: 'nope' });
    expect(dismissNotice(s).notice).toBeUndefined();
    expect(reduce(s, { type: 'langResult', id: 1, op: 'lint', items: [] })).toBe(s);
  });
});
