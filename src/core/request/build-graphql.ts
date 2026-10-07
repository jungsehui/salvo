import type { GraphqlRequest } from '../generated/salvo-file';
import type { ResolvedRequest } from '../types';
import type { Substituter } from '../vars/substitute';
import { resolveHeaders } from './resolve-headers';

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * GraphQL over HTTP: POST with a JSON payload. `variables` substitutes
 * top-level strings only, as text: the 0.1 behavior, kept so files that pass
 * numeric vars to String variables keep working (spec section 1).
 */
export async function buildGraphqlRequest(
  request: GraphqlRequest,
  envHeaders: Record<string, string> | undefined,
  sub: Substituter
): Promise<ResolvedRequest> {
  const url = await sub.text(request.url);
  const headers = await resolveHeaders(envHeaders, request.headers, sub);
  let variables: Record<string, unknown> | undefined;
  if (request.variables) {
    variables = {};
    for (const [key, value] of Object.entries(request.variables)) {
      variables[key] = typeof value === 'string' ? await sub.text(value) : value;
    }
  }
  return {
    method: 'POST',
    url,
    headers,
    body: { query: request.operation, variables, operationName: request.operationName },
    timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}
