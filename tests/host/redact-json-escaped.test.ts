import { describe, it, expect } from 'vitest';
import { runSalvoFile } from '../../src/host/run-controller';
import type { ResolvedRequest, HttpResponse } from '../../src/core/types';

const RAW = 'pa"ss\\word';
const ESCAPED = 'pa\\"ss\\\\word';
const secrets = async (name: string) => (name === 'P' ? RAW : undefined);

describe('Redacting JSON-escaped secrets', () => {
  it('redacts the escaped form a server echoes and a failing json expectation prints', async () => {
    const fileText = `salvo: 1
request:
  method: POST
  url: "http://localhost:4000/login"
  body:
    json:
      password: "{{secret:P}}"
vars: {}
cases:
  - name: echo
    expect: { status: 200, json: { password: "nope" } }
`;
    const stub: (req: ResolvedRequest) => Promise<HttpResponse> = async (req) => {
      const text = req.body.kind === 'encoded' ? req.body.text : '';
      return { status: 200, headers: {}, bodyText: text, json: JSON.parse(text), durationMs: 1 };
    };
    const r = await runSalvoFile({ fileText, manifest: undefined, envName: 'default', deps: { secrets, send: stub } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.results[0];
    expect(result?.outcome).toBe('failed');
    const bodyText = result?.response?.bodyText ?? '';
    const assertions = result?.assertions ?? [];
    const texts = [
      bodyText,
      JSON.stringify(result?.response?.json ?? {}),
      ...assertions.flatMap((a) => [a.expected, a.actual]),
      r.report,
    ];
    for (const text of texts) {
      expect(text).not.toContain(RAW);
      expect(text).not.toContain(ESCAPED);
    }
    const jsonAssertion = assertions.find((a) => !a.pass);
    expect(bodyText.includes('<redacted>') || (jsonAssertion?.actual ?? '').includes('<redacted>')).toBe(true);
  });
});
