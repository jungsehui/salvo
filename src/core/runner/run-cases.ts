import type { SalvoFile } from '../generated/salvo-file';
import type { SalvoManifest } from '../generated/salvo-manifest';
import type { RunResult, SecretResolver, Transport } from '../types';
import { resolveCase } from '../vars/resolve-case';
import { evaluateExpect } from '../assert/evaluate-expect';

export async function runCases(args: {
  file: SalvoFile;
  envName: string;
  manifest: SalvoManifest | undefined;
  selected: number[] | 'all';
  deps: { secrets: SecretResolver; send: Transport };
}): Promise<RunResult[]> {
  const { file, envName, manifest, deps } = args;
  const env = manifest?.environments?.[envName];
  const all = file.cases ?? [];
  const indexes = args.selected === 'all' ? all.map((_, i) => i) : [...args.selected].sort((a, b) => a - b);

  const results: RunResult[] = [];
  for (const i of indexes) {
    const kase = all[i];
    if (!kase) continue;
    const base = { caseIndex: i, caseName: kase.name };

    const resolved = await resolveCase({ file, envName, env, caseIndex: i, secrets: deps.secrets });
    if (resolved.kind === 'skipped') {
      results.push({ ...base, outcome: 'skipped', assertions: [], error: resolved.reason });
      continue;
    }
    if (resolved.kind === 'error') {
      results.push({ ...base, outcome: 'error', assertions: [], error: resolved.message });
      continue;
    }

    try {
      const response = await deps.send(resolved.request);
      const assertions = evaluateExpect(kase.expect, response);
      results.push({ ...base, outcome: assertions.every((a) => a.pass) ? 'passed' : 'failed', assertions, response });
    } catch (e) {
      results.push({ ...base, outcome: 'error', assertions: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
