import type { SalvoFile } from '../generated/salvo-file';
import type { EnvironmentDef } from '../generated/salvo-manifest';
import type { Primitive, ResolvedRequest, SecretResolver } from '../types';
import { isGraphqlRequest } from '../../shared/request-kind';
import { buildGraphqlRequest } from '../request/build-graphql';
import { buildHttpRequest } from '../request/build-http';
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
  /** Receives values derived from secrets (Basic credentials) so callers can redact them. */
  sensitive?: (value: string) => void;
}): Promise<ResolveOutcome> {
  const { file, envName, env, caseIndex, secrets } = args;
  const kase = file.cases?.[caseIndex];
  if (!kase) return { kind: 'error', message: `No case at index ${caseIndex}.`, missing: [] };

  if (kase.environments && !kase.environments.includes(envName)) {
    return { kind: 'skipped', reason: `Case is limited to [${kase.environments.join(', ')}]; active environment is "${envName}".` };
  }

  const scope: Record<string, Primitive> = { ...(env?.vars ?? {}), ...(file.vars ?? {}), ...(kase.vars ?? {}) };
  const sub = new Substituter(scope, secrets);
  const request = isGraphqlRequest(file.request)
    ? await buildGraphqlRequest(file.request, env?.headers, sub)
    : await buildHttpRequest(file.request, env?.headers, sub, args.sensitive ?? (() => undefined));

  const problems = sub.problems();
  if (problems) {
    return { kind: 'error', message: `Cannot resolve case "${kase.name}": ${problems}.`, missing: [...sub.missingSecrets] };
  }
  const badUrl = checkUrl(request.url);
  if (badUrl) return { kind: 'error', message: `Cannot resolve case "${kase.name}": ${badUrl}`, missing: [] };
  return { kind: 'resolved', request };
}

/** Only absolute http and https URLs are sent; anything else is a case error (spec section 2). */
function checkUrl(url: string): string | undefined {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') return undefined;
  } catch {
    // not parseable: report below
  }
  return `invalid URL after substitution: "${url}". Use an absolute http or https URL.`;
}
