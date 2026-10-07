import type { SalvoFile } from '../generated/salvo-file';
import type { EnvironmentDef } from '../generated/salvo-manifest';
import type { Primitive, ResolvedRequest, SecretResolver } from '../types';
import { isGraphqlRequest } from '../../shared/request-kind';
import { buildGraphqlRequest } from '../request/build-graphql';
import { Substituter } from './substitute';

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

  if (!isGraphqlRequest(file.request)) {
    // Task 3 of the HTTP core plan replaces this with the HTTP request builder.
    return { kind: 'error', message: `Cannot resolve case "${kase.name}": HTTP requests are not supported yet.`, missing: [] };
  }

  const scope: Record<string, Primitive> = { ...(env?.vars ?? {}), ...(file.vars ?? {}), ...(kase.vars ?? {}) };
  const sub = new Substituter(scope, secrets);
  const request = await buildGraphqlRequest(file.request, env?.headers, sub);

  const problems = sub.problems();
  if (problems) {
    return { kind: 'error', message: `Cannot resolve case "${kase.name}": ${problems}.`, missing: [...sub.missingSecrets] };
  }
  return { kind: 'resolved', request };
}
