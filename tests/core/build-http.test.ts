import { describe, it, expect } from 'vitest';
import { buildHttpRequest } from '../../src/core/request/build-http';
import { Substituter } from '../../src/core/vars/substitute';
import type { HttpRequest } from '../../src/core/generated/salvo-file';

const secrets = async (n: string) => (n === 'PW' ? 's3cret' : undefined);

const build = async (
  request: HttpRequest,
  scope: Record<string, string | number | boolean | null> = {},
  env?: Record<string, string>
) => {
  const seen: string[] = [];
  const sub = new Substituter(scope, secrets);
  const r = await buildHttpRequest(request, env, sub, (v) => seen.push(v));
  return { r, seen, problems: sub.problems() };
};

describe('buildHttpRequest', () => {
  it('defaults to GET with no body and no content type', async () => {
    const { r } = await build({ url: 'http://x.test/a' });
    expect(r).toEqual({ method: 'GET', url: 'http://x.test/a', headers: {}, body: { kind: 'none' }, timeoutMs: 30_000 });
  });

  it('passes every method through', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const) {
      expect((await build({ method, url: 'http://x.test' })).r.method).toBe(method);
    }
  });

  it('encodes query values, keeps an existing query and fragment, and drops nulls', async () => {
    const { r } = await build(
      { url: 'http://x.test/a?x=1#top', query: { page: '{{page}}', q: 'a b&c=é', skip: '{{none}}', off: null, on: true } },
      { page: 2, none: null }
    );
    expect(r.url).toBe('http://x.test/a?x=1&page=2&q=a+b%26c%3D%C3%A9&on=true#top');
  });

  it('builds a JSON body with types kept and sets its content type', async () => {
    const { r } = await build(
      { method: 'POST', url: 'http://x.test', body: { json: { name: '{{name}}', age: '{{age}}', gone: '{{none}}', tags: ['{{none}}'] } } },
      { name: 'Ann', age: 30, none: null }
    );
    expect(r.headers['content-type']).toBe('application/json');
    expect(r.body).toEqual({ kind: 'encoded', text: '{"name":"Ann","age":30,"tags":[null]}' });
  });

  it('lets an explicit content type win over the default', async () => {
    const { r } = await build(
      { method: 'POST', url: 'http://x.test', headers: { 'Content-Type': 'text/csv' }, body: { text: 'a,{{v}}' } },
      { v: 1 }
    );
    expect(r.headers).toEqual({ 'content-type': 'text/csv' });
    expect(r.body).toEqual({ kind: 'encoded', text: 'a,1' });
  });

  it('defaults a text body to text/plain', async () => {
    const { r } = await build({ method: 'POST', url: 'http://x.test', body: { text: 'hi' } });
    expect(r.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('form-encodes a form body and drops null entries', async () => {
    const { r } = await build(
      { method: 'POST', url: 'http://x.test', body: { form: { user: '{{u}}', remember: true, skip: '{{none}}' } } },
      { u: 'a b', none: null }
    );
    expect(r.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(r.body).toEqual({ kind: 'encoded', text: 'user=a+b&remember=true' });
  });

  it('sends Basic auth as UTF-8 base64 and reports the credential as sensitive', async () => {
    const ascii = await build({ url: 'http://x.test', auth: { basic: { username: 'alice', password: '{{secret:PW}}' } } });
    expect(ascii.r.headers['authorization']).toBe('Basic YWxpY2U6czNjcmV0');
    expect(ascii.seen).toEqual(['YWxpY2U6czNjcmV0']);
    const utf8 = await build({ url: 'http://x.test', auth: { basic: { username: 'josé', password: 'pässwörd' } } });
    expect(utf8.r.headers['authorization']).toBe('Basic am9zw6k6cMOkc3N3w7ZyZA==');
  });

  it('sends no Authorization header when the username resolves to null', async () => {
    const { r, seen } = await build({ url: 'http://x.test', auth: { basic: { username: '{{user}}', password: 'x' } } }, { user: null });
    expect(r.headers['authorization']).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it('treats a missing password as empty', async () => {
    const { r } = await build({ url: 'http://x.test', auth: { basic: { username: 'alice' } } });
    expect(r.headers['authorization']).toBe('Basic YWxpY2U6');
  });
});
