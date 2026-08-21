import { describe, it, expect } from 'vitest';
import { runCases } from '../../src/core/runner/run-cases';
import type { SalvoFile } from '../../src/core/generated/salvo-file';
import type { HttpResponse, Transport } from '../../src/core/types';

const FILE: SalvoFile = {
  salvo: 1,
  request: { url: 'http://x.test/graphql', headers: { auth: '{{token}}' }, operation: 'query { ok }' },
  cases: [
    { name: 'ok', vars: { token: 'good' }, expect: { status: 200, json: { 'data.ok': true } } },
    { name: 'denied', vars: { token: 'bad' }, expect: { status: 200, json: { 'errors[0].extensions.code': 'UNAUTHENTICATED' } } },
    { name: 'local only', environments: ['local'], vars: { token: 'x' } },
    { name: 'boom', vars: { token: 'boom' } },
  ],
};

const okBody = { data: { ok: true } };
const deniedBody = { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }], data: null };

const fakeSend: Transport = async (req): Promise<HttpResponse> => {
  const token = req.headers['auth'];
  if (token === 'boom') throw new Error('socket hang up');
  const json = token === 'good' ? okBody : deniedBody;
  return { status: 200, headers: { 'content-type': 'application/json' }, bodyText: JSON.stringify(json), json, durationMs: 3 };
};

const deps = { secrets: async () => undefined, send: fakeSend };

describe('runCases', () => {
  it('runs all cases and scores them independently', async () => {
    const results = await runCases({ file: FILE, envName: 'test', manifest: undefined, selected: 'all', deps });
    expect(results.map((r) => r.outcome)).toEqual(['passed', 'passed', 'skipped', 'error']);
    expect(results[3]?.error).toContain('socket hang up');
    expect(results[0]?.caseIndex).toBe(0);
  });

  it('deduplicates selected indexes so a case never fires twice', async () => {
    const results = await runCases({ file: FILE, envName: 'test', manifest: undefined, selected: [1, 1], deps });
    expect(results).toHaveLength(1);
    expect(results[0]?.caseIndex).toBe(1);
  });

  it('runs only the selected indexes, preserving file order', async () => {
    const results = await runCases({ file: FILE, envName: 'test', manifest: undefined, selected: [1], deps });
    expect(results).toHaveLength(1);
    expect(results[0]?.caseName).toBe('denied');
  });

  it('marks failed assertions as failed, not error', async () => {
    const file: SalvoFile = { ...FILE, cases: [{ name: 'wrong', vars: { token: 'bad' }, expect: { json: { 'data.ok': true } } }] };
    const results = await runCases({ file, envName: 'test', manifest: undefined, selected: 'all', deps });
    expect(results[0]?.outcome).toBe('failed');
    expect(results[0]?.assertions.some((a) => !a.pass)).toBe(true);
  });

  it('reads the environment from the manifest by name', async () => {
    const file: SalvoFile = { salvo: 1, request: { url: '{{baseUrl}}/g', operation: 'q' }, cases: [{ name: 'a' }] };
    const manifest = { salvo: 1 as const, id: 'proj-12345678', environments: { dev: { vars: { baseUrl: 'http://dev.test' } } } };
    const seen: string[] = [];
    const send: Transport = async (req) => {
      seen.push(req.url);
      return { status: 200, headers: {}, bodyText: '{}', json: {}, durationMs: 1 };
    };
    await runCases({ file, envName: 'dev', manifest, selected: 'all', deps: { ...deps, send } });
    expect(seen).toEqual(['http://dev.test/g']);
  });
});
