import { describe, it, expect } from 'vitest';
import { resolveCase } from '../../src/core/vars/resolve-case';
import type { SalvoFile } from '../../src/core/generated/salvo-file';

const secrets = async (name: string) => (name === 'TOKEN' ? 'sec-123' : undefined);

const FILE: SalvoFile = {
  salvo: 1,
  request: {
    url: '{{baseUrl}}/graphql',
    headers: { authorization: 'Bearer {{token}}', 'x-region': '{{region}}' },
    operation: 'query Me { me { id } }',
    variables: { first: 10, cursor: '{{cursor}}' },
  },
  vars: { region: 'file-region', cursor: 'c-1' },
  cases: [
    { name: 'valid', vars: { token: '{{secret:TOKEN}}' } },
    { name: 'no token', vars: { token: '' } },
    { name: 'local only', environments: ['local'], vars: { token: '' } },
    { name: 'missing secret', vars: { token: '{{secret:NOPE}}' } },
  ],
};

const ENV = { vars: { baseUrl: 'http://x.test', region: 'env-region' }, headers: { 'x-env': 'test' } };

describe('resolveCase', () => {
  it('applies the precedence chain env < file < case and resolves secrets', async () => {
    const r = await resolveCase({ file: FILE, envName: 'test', env: ENV, caseIndex: 0, secrets });
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect(r.request.url).toBe('http://x.test/graphql');
    expect(r.request.headers['authorization']).toBe('Bearer sec-123');
    expect(r.request.headers['x-region']).toBe('file-region'); // file var beats env var
    expect(r.request.headers['x-env']).toBe('test');           // env headers merge in
    expect(r.request.body.variables).toEqual({ first: 10, cursor: 'c-1' });
    expect(r.request.body.query).toContain('query Me');
  });

  it('skips a case whose environments whitelist excludes the active env', async () => {
    const r = await resolveCase({ file: FILE, envName: 'prod', env: ENV, caseIndex: 2, secrets });
    expect(r.kind).toBe('skipped');
    if (r.kind === 'skipped') expect(r.reason).toContain('prod');
  });

  it('errors with the list of missing secrets', async () => {
    const r = await resolveCase({ file: FILE, envName: 'test', env: ENV, caseIndex: 3, secrets });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.missing).toEqual(['NOPE']);
  });

  it('errors on an undefined template variable', async () => {
    const file: SalvoFile = { salvo: 1, request: { url: '{{nowhere}}/g', operation: 'q' }, cases: [{ name: 'a' }] };
    const r = await resolveCase({ file, envName: 't', env: undefined, caseIndex: 0, secrets });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('nowhere');
  });

  it('never substitutes inside the operation body', async () => {
    const file: SalvoFile = {
      salvo: 1,
      request: { url: 'http://x.test', operation: 'query { literal(v: "{{region}}") }' },
      vars: { region: 'r' },
      cases: [{ name: 'a' }],
    };
    const r = await resolveCase({ file, envName: 't', env: undefined, caseIndex: 0, secrets });
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') expect(r.request.body.query).toContain('{{region}}'); // untouched
  });
});
