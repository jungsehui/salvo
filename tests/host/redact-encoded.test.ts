import { describe, it, expect } from 'vitest';
import { runSalvoFile } from '../../src/host/run-controller';
import type { ResolvedRequest, HttpResponse } from '../../src/core/types';

const secrets = async (name: string) => (name === 'T' ? 'ab/cd= +x' : undefined);

describe('Redacting URL-encoded secrets', () => {
  it('redacts encoded secrets in error messages when URL is invalid', async () => {
    const fileText = `salvo: 1
request:
  url: "localhost:4000/me"
  query: { token: "{{secret:T}}" }
vars: {}
cases:
  - name: invalid-url
`;
    const r = await runSalvoFile({ fileText, manifest: undefined, envName: 'default', deps: { secrets, send: async () => ({ status: 200, headers: {}, bodyText: '', durationMs: 0 }) } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0]?.outcome).toBe('error');
    const combined = JSON.stringify(r.results) + r.report;
    expect(combined).not.toContain('ab%2Fcd%3D+%2Bx');
    expect(combined).not.toContain('ab/cd= +x');
    expect(combined).toContain('<redacted>');
  });

  it('redacts URL-encoded secrets echoed by the server in the response', async () => {
    const fileText = `salvo: 1
request:
  method: GET
  url: "http://localhost:4000/me"
  query: { token: "{{secret:T}}" }
vars: {}
cases:
  - name: server-echo
    expect: { status: 200 }
`;
    const stub: (req: ResolvedRequest) => Promise<HttpResponse> = async (req) => ({
      status: 200,
      headers: {},
      bodyText: `URL was ${req.url}`,
      json: { url: req.url },
      durationMs: 5,
    });
    const r = await runSalvoFile({ fileText, manifest: undefined, envName: 'default', deps: { secrets, send: stub } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0]?.outcome).toBe('passed');
    const combined = JSON.stringify(r.results) + (r.results[0]?.response?.bodyText ?? '') + JSON.stringify(r.results[0]?.response?.json ?? {});
    expect(combined).not.toContain('ab%2Fcd%3D+%2Bx');
  });
});
