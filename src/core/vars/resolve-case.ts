import type { SalvoFile } from '../generated/salvo-file';
import type { EnvironmentDef } from '../generated/salvo-manifest';
import type { Primitive, ResolvedRequest, SecretResolver } from '../types';

const PLACEHOLDER = /\{\{\s*(secret:)?([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ResolveOutcome =
  | { kind: 'resolved'; request: ResolvedRequest }
  | { kind: 'skipped'; reason: string }
  | { kind: 'error'; message: string; missing: string[] };

export async function resolveCase(args: {
  file: SalvoFile;
  envName: string;
  env: EnvironmentDef | undefined;
  caseIndex: number;
  secrets: SecretResolver;
}): Promise<ResolveOutcome> {
  const { file, envName, env, caseIndex, secrets } = args;
  const kase = file.cases?.[caseIndex];
  if (!kase) return { kind: 'error', message: `No case at index ${caseIndex}.`, missing: [] };

  if (kase.environments && !kase.environments.includes(envName)) {
    return { kind: 'skipped', reason: `Case is limited to [${kase.environments.join(', ')}]; active environment is "${envName}".` };
  }

  const scope: Record<string, Primitive> = { ...(env?.vars ?? {}), ...(file.vars ?? {}), ...(kase.vars ?? {}) };
  const missingVars = new Set<string>();
  const missingSecrets = new Set<string>();

  const sub = async (input: string): Promise<string> => {
    let out = '';
    let last = 0;
    for (const m of input.matchAll(PLACEHOLDER)) {
      out += input.slice(last, m.index);
      const [, isSecret, name] = m;
      if (isSecret) {
        const v = await secrets(name!);
        if (v === undefined) missingSecrets.add(name!);
        out += v ?? '';
      } else {
        const raw = scope[name!];
        // A var's *value* may itself be a secret reference (one nesting level, e.g. token: "{{secret:T}}").
        if (raw === undefined) {
          missingVars.add(name!);
        } else {
          let resolved: string;
          if (typeof raw === 'string') {
            const hasPlaceholder = PLACEHOLDER.test(raw);
            PLACEHOLDER.lastIndex = 0;
            resolved = hasPlaceholder ? await sub(raw) : String(raw);
          } else {
            resolved = String(raw ?? '');
          }
          out += resolved;
        }
      }
      last = m.index! + m[0].length;
    }
    return out + input.slice(last);
  };

  const url = await sub(file.request.url);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...(env?.headers ?? {}), ...(file.request.headers ?? {}) })) {
    headers[k.toLowerCase()] = await sub(v);
  }

  let variables: Record<string, unknown> | undefined;
  if (file.request.variables) {
    variables = {};
    for (const [k, v] of Object.entries(file.request.variables)) {
      variables[k] = typeof v === 'string' ? await sub(v) : v;
    }
  }

  if (missingSecrets.size > 0 || missingVars.size > 0) {
    const parts: string[] = [];
    if (missingSecrets.size) parts.push(`missing secrets: ${[...missingSecrets].join(', ')}`);
    if (missingVars.size) parts.push(`undefined variables: ${[...missingVars].join(', ')}`);
    return { kind: 'error', message: `Cannot resolve case "${kase.name}": ${parts.join('; ')}.`, missing: [...missingSecrets] };
  }

  return {
    kind: 'resolved',
    request: {
      method: 'POST',
      url,
      headers,
      body: { query: file.request.operation, variables, operationName: file.request.operationName },
      timeoutMs: file.request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
  };
}
