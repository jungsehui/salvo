import type { HttpRequest } from '../generated/salvo-file';
import type { RequestBody, ResolvedRequest } from '../types';
import type { Substituter } from '../vars/substitute';
import { resolveHeaders } from './resolve-headers';
import { DEFAULT_TIMEOUT_MS } from './build-graphql';

type TextMap = Record<string, string | number | boolean | null> | undefined;

/**
 * Plain HTTP (spec section 1): method defaults to GET; query and form values,
 * headers and Basic auth resolve as text, `body.json` keeps types; a null
 * value omits its entry. `sensitive` receives every Basic credential so the
 * run controller can redact it like a secret.
 */
export async function buildHttpRequest(
  request: HttpRequest,
  envHeaders: Record<string, string> | undefined,
  sub: Substituter,
  sensitive: (value: string) => void
): Promise<ResolvedRequest> {
  const url = await sub.text(request.url);
  const query = await resolveEntries(request.query, sub);
  const headers = await resolveHeaders(envHeaders, request.headers, sub);

  const basic = request.auth?.basic;
  if (basic) {
    const username = await sub.typed(basic.username);
    if (username !== null) {
      const password = basic.password === undefined ? '' : await sub.typed(basic.password);
      const credential = Buffer.from(`${String(username)}:${password === null ? '' : String(password)}`, 'utf8').toString('base64');
      sensitive(credential);
      headers['authorization'] = `Basic ${credential}`;
    }
  }

  let body: RequestBody = { kind: 'none' };
  let contentType: string | undefined;
  const b = request.body;
  if (b !== undefined && Object.hasOwn(b, 'json')) {
    body = { kind: 'encoded', text: JSON.stringify(await sub.json(b.json)) };
    contentType = 'application/json';
  } else if (b?.text !== undefined) {
    body = { kind: 'encoded', text: await sub.text(b.text) };
    contentType = 'text/plain; charset=utf-8';
  } else if (b?.form !== undefined) {
    body = { kind: 'encoded', text: new URLSearchParams(await resolveEntries(b.form, sub)).toString() };
    contentType = 'application/x-www-form-urlencoded';
  }
  if (contentType !== undefined && headers['content-type'] === undefined) headers['content-type'] = contentType;

  return {
    method: request.method ?? 'GET',
    url: withQuery(url, query),
    headers,
    body,
    timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** Text-valued entries in file order; a null value, literal or resolved, drops the entry. */
async function resolveEntries(map: TextMap, sub: Substituter): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(map ?? {})) {
    const resolved = typeof value === 'string' ? await sub.typed(value) : value;
    if (resolved !== null) out.push([key, String(resolved)]);
  }
  return out;
}

/** Appends encoded entries, keeping any query already in the URL and any fragment after it. */
function withQuery(url: string, entries: [string, string][]): string {
  if (entries.length === 0) return url;
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const separator = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&';
  return `${base}${separator}${new URLSearchParams(entries).toString()}${hash}`;
}
