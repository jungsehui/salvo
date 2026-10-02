import type { RunResult } from '../core/types';

export interface RunEntry {
  results: RunResult[];
  running: boolean;
}

/** Results for re-run cases replace their predecessors; everything else survives, ordered by case index. */
export function mergeResults(previous: RunResult[], fresh: RunResult[]): RunResult[] {
  const replaced = new Set(fresh.map((r) => r.caseIndex));
  return [...previous.filter((r) => !replaced.has(r.caseIndex)), ...fresh].sort((a, b) => a.caseIndex - b.caseIndex);
}

/** Host-owned run state (decision 8): outlives any webview, keyed by document URI string. */
export class RunStore {
  private readonly entries = new Map<string, RunEntry>();
  private readonly listeners = new Set<(key: string) => void>();

  get(key: string): RunEntry | undefined {
    return this.entries.get(key);
  }

  setRunning(key: string): void {
    this.entries.set(key, { results: this.entries.get(key)?.results ?? [], running: true });
    this.emit(key);
  }

  setResults(key: string, results: RunResult[]): void {
    this.entries.set(key, { results, running: false });
    this.emit(key);
  }

  clear(key: string): void {
    this.entries.delete(key);
    this.emit(key);
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(key: string): void {
    for (const l of this.listeners) l(key);
  }
}
