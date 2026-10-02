import { describe, it, expect } from 'vitest';
import { mergeResults, RunStore } from '../../src/host/run-store';
import type { RunResult } from '../../src/core/types';

const res = (i: number, outcome: RunResult['outcome'] = 'passed'): RunResult => ({ caseIndex: i, caseName: `c${i}`, outcome, assertions: [] });

describe('mergeResults', () => {
  it('replaces results for re-run cases and keeps the rest sorted by index', () => {
    expect(mergeResults([res(0), res(1, 'failed'), res(2)], [res(1)])).toEqual([res(0), res(1), res(2)]);
    expect(mergeResults([], [res(3), res(1)])).toEqual([res(1), res(3)]);
  });
});

describe('RunStore', () => {
  it('tracks running and results per key and notifies listeners', () => {
    const store = new RunStore();
    const seen: string[] = [];
    const off = store.onChange((k) => seen.push(k));
    store.setRunning('a');
    expect(store.get('a')).toEqual({ results: [], running: true });
    store.setResults('a', [res(0)]);
    expect(store.get('a')).toEqual({ results: [res(0)], running: false });
    store.setRunning('a');
    expect(store.get('a')?.results).toEqual([res(0)]);
    off();
    store.clear('a');
    expect(store.get('a')).toBeUndefined();
    expect(seen).toEqual(['a', 'a', 'a']);
  });
});
