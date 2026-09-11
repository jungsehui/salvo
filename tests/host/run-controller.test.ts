import { describe, it, expect } from 'vitest';
import { formatRunReport, runSalvoFile } from '../../src/host/run-controller';
import type { HttpResponse, Transport } from '../../src/core/types';

const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  headers: { auth: "{{token}}" }
  operation: |
    query { ok }
cases:
  - name: ok
    vars: { token: good }
    expect: { status: 200, json: { "data.ok": true } }
  - name: denied
    vars: { token: bad }
    expect: { status: 200, json: { "errors[0].extensions.code": "UNAUTHENTICATED" } }
  - name: boom
    vars: { token: boom }
`;

const send: Transport = async (req): Promise<HttpResponse> => {
  const token = req.headers['auth'];
  if (token === 'boom') throw new Error('socket hang up');
  const json = token === 'good' ? { data: { ok: true } } : { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }], data: null };
  return { status: 200, headers: {}, bodyText: JSON.stringify(json), json, durationMs: 7 };
};

describe('runSalvoFile', () => {
  it('runs all cases and formats a deterministic report', async () => {
    const r = await runSalvoFile({ fileText: DOC, manifest: undefined, envName: 'default', deps: { secrets: async () => undefined, send } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.map((x) => x.outcome)).toEqual(['passed', 'passed', 'error']);
    expect(r.report).toContain('Salvo run · environment "default" · 3 cases');
    expect(r.report).toContain('PASS  ok (200, 7ms)');
    expect(r.report).toContain('ERROR boom — socket hang up');
    expect(r.report).toContain('2 passed, 0 failed, 0 skipped, 1 error');
  });

  it('reports parse failures as issues instead of running', async () => {
    const r = await runSalvoFile({ fileText: 'salvo: 1\nrequest: [unclosed', manifest: undefined, envName: 'x', deps: { secrets: async () => undefined, send } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.severity).toBe('error');
  });

  it('redacts resolved secret values from results and the report', async () => {
    const doc = `salvo: 1
request:
  url: "http://x.test/graphql"
  headers: { auth: "{{secret:TOKEN}}", mode: "{{mode}}" }
  operation: |
    query { ok }
vars: { mode: echo }
cases:
  - name: echo
    expect: { json: { "data.echo": "nope" } }
  - name: boom
    vars: { mode: boom }
`;
    const echoing: Transport = async (req): Promise<HttpResponse> => {
      const token = req.headers['auth'] ?? '';
      if (req.headers['mode'] === 'boom') throw new Error(`rejected token ${token}`);
      const json = { data: { echo: token } };
      return { status: 200, headers: { 'x-echo': token }, bodyText: JSON.stringify(json), json, durationMs: 1 };
    };
    const r = await runSalvoFile({
      fileText: doc,
      manifest: undefined,
      envName: 'default',
      deps: { secrets: async (n) => (n === 'TOKEN' ? 's3cret-value' : undefined), send: echoing },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.results) + r.report).not.toContain('s3cret-value');
    expect(r.results[0]?.response?.headers['x-echo']).toBe('<redacted>');
    expect(r.results[1]?.error).toBe('rejected token <redacted>');
  });

  it('runs only the selected cases', async () => {
    const r = await runSalvoFile({ fileText: DOC, manifest: undefined, envName: 'default', selected: [2], deps: { secrets: async () => undefined, send } });
    expect(r.ok && r.results.map((x) => x.caseIndex)).toEqual([2]);
  });
});

describe('formatRunReport', () => {
  it('shows the first failing assertion for failed cases', () => {
    const report = formatRunReport(
      [{
        caseIndex: 0, caseName: 'wrong', outcome: 'failed',
        assertions: [
          { target: 'json data.ok', expected: 'equals true', actual: 'false', pass: false },
          { target: 'status', expected: '200', actual: '200', pass: true },
        ],
        response: { status: 200, headers: {}, bodyText: '', json: {}, durationMs: 3 },
      }],
      'dev'
    );
    expect(report).toContain('FAIL  wrong — json data.ok: expected equals true, actual false');
    expect(report).toContain('0 passed, 1 failed, 0 skipped, 0 errors');
  });
});
