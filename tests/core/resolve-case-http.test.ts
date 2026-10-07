import { describe, it, expect } from 'vitest';
import { resolveCase } from '../../src/core/vars/resolve-case';
import type { SalvoFile } from '../../src/core/generated/salvo-file';

const secrets = async (n: string) => (n === 'PW' ? 's3cret' : undefined);

describe('resolveCase (HTTP requests)', () => {
  it('resolves an HTTP request through the env < file < case chain and omits null headers', async () => {
    const file: SalvoFile = {
      salvo: 1,
      request: { method: 'GET', url: '{{base}}/me', headers: { authorization: '{{auth}}' } },
      cases: [{ name: 'valid', vars: { auth: 'Bearer t-1' } }, { name: 'none', vars: { auth: null } }],
    };
    const env = { vars: { base: 'http://x.test' } };
    const a = await resolveCase({ file, envName: 'e', env, caseIndex: 0, secrets });
    const b = await resolveCase({ file, envName: 'e', env, caseIndex: 1, secrets });
    expect(a.kind === 'resolved' && a.request.url).toBe('http://x.test/me');
    expect(a.kind === 'resolved' && a.request.headers).toEqual({ authorization: 'Bearer t-1' });
    expect(b.kind === 'resolved' && b.request.headers).toEqual({});
  });

  it('reports the Basic credential through the sensitive callback', async () => {
    const file: SalvoFile = {
      salvo: 1,
      request: { url: 'http://x.test', auth: { basic: { username: 'alice', password: '{{secret:PW}}' } } },
      cases: [{ name: 'a' }],
    };
    const seen: string[] = [];
    await resolveCase({ file, envName: 'e', env: undefined, caseIndex: 0, secrets, sensitive: (v) => seen.push(v) });
    expect(seen).toEqual(['YWxpY2U6czNjcmV0']);
  });

  it('rejects a URL that is not absolute http or https after substitution, for both request kinds', async () => {
    for (const request of [{ url: '{{base}}/me' }, { url: '{{base}}/graphql', operation: 'q' }]) {
      const file: SalvoFile = { salvo: 1, request, cases: [{ name: 'c' }] };
      const r = await resolveCase({ file, envName: 'e', env: { vars: { base: 'localhost:4000' } }, caseIndex: 0, secrets });
      expect(r.kind).toBe('error');
      if (r.kind === 'error') {
        expect(r.message).toContain('Cannot resolve case "c": invalid URL after substitution: "localhost:4000/');
        expect(r.message).toContain('Use an absolute http or https URL.');
      }
    }
  });
});
