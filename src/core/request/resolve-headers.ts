import type { Substituter } from '../vars/substitute';

/**
 * Environment headers under request headers, keys lower-cased, so the request
 * wins whatever the case. A value that is exactly one placeholder resolving to
 * null omits the header (spec section 1, rule 2); any other value is text.
 */
export async function resolveHeaders(
  envHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
  sub: Substituter
): Promise<Record<string, string>> {
  const merged = new Map<string, string>();
  for (const [name, value] of Object.entries(envHeaders ?? {})) merged.set(name.toLowerCase(), value);
  for (const [name, value] of Object.entries(requestHeaders ?? {})) merged.set(name.toLowerCase(), value);
  const out: Record<string, string> = {};
  for (const [name, value] of merged) {
    const resolved = await sub.typed(value);
    if (resolved !== null) out[name] = String(resolved);
  }
  return out;
}
