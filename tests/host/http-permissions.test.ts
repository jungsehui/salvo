import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { runSalvoFile } from '../../src/host/run-controller';
import { createFetchTransport } from '../../src/core/http/fetch-transport';

const TOKEN = 'good-token-123';
const CREDENTIAL = 'YWxpY2U6czNjcmV0LXBhc3M='; // base64("alice:s3cret-pass")

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://local');
      const auth = req.headers.authorization;
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (url.pathname === '/me') {
        if (auth === undefined) return send(401, { code: 'UNAUTHENTICATED' });
        if (auth === `Bearer ${TOKEN}`) return send(200, { id: 1, token: TOKEN });
        if (auth === 'Bearer expired') return send(401, { code: 'TOKEN_EXPIRED' });
        if (auth === 'Bearer noperm') return send(403, { code: 'FORBIDDEN' });
        return send(401, { code: 'INVALID_TOKEN' });
      }
      if (url.pathname === '/echo') {
        return send(auth === `Basic ${CREDENTIAL}` ? 200 : 401, {
          query: Object.fromEntries(url.searchParams),
          contentType: req.headers['content-type'] ?? null,
          body: raw ? JSON.parse(raw) : null,
          authorization: auth ?? null,
        });
      }
      return send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const secrets = async (name: string) => (({ VALID: TOKEN, PW: 's3cret-pass' }) as Record<string, string>)[name];

describe('HTTP permission checks end to end', () => {
  it('runs valid, expired, forbidden, and no-token cases and redacts the echoed token', async () => {
    const fileText = `salvo: 1
request:
  method: GET
  url: "{{base}}/me"
  headers:
    authorization: "{{auth}}"
vars: { base: "${base}" }
cases:
  - name: valid token
    vars: { auth: "Bearer {{secret:VALID}}" }
    expect: { status: 200, json: { id: 1 } }
  - name: expired token
    vars: { auth: "Bearer expired" }
    expect: { status: 401, json: { code: TOKEN_EXPIRED } }
  - name: no permission
    vars: { auth: "Bearer noperm" }
    expect: { status: 403, json: { code: FORBIDDEN } }
  - name: no token
    vars: { auth: null }
    expect: { status: 401, json: { code: UNAUTHENTICATED } }
`;
    const r = await runSalvoFile({ fileText, manifest: undefined, envName: 'default', deps: { secrets, send: createFetchTransport() } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.map((x) => [x.caseName, x.outcome])).toEqual([
      ['valid token', 'passed'],
      ['expired token', 'passed'],
      ['no permission', 'passed'],
      ['no token', 'passed'],
    ]);
    expect(JSON.stringify(r.results) + r.report).not.toContain(TOKEN);
  });

  it('sends query, a typed JSON body, and Basic auth, and redacts the echoed credential', async () => {
    const fileText = `salvo: 1
request:
  method: POST
  url: "{{base}}/echo"
  query: { page: "{{page}}", skip: "{{none}}" }
  auth:
    basic: { username: alice, password: "{{secret:PW}}" }
  body:
    json: { name: "{{name}}", age: "{{age}}", tags: ["{{tag}}", "{{none}}"], gone: "{{none}}" }
vars: { base: "${base}", page: 2, none: null, name: Ann, age: 30, tag: x }
cases:
  - name: echo
    expect:
      status: 200
      json:
        query.page: "2"
        query.skip: { exists: false }
        contentType: application/json
        body.age: 30
        body.tags[1]: null
        body.gone: { exists: false }
`;
    const r = await runSalvoFile({ fileText, manifest: undefined, envName: 'default', deps: { secrets, send: createFetchTransport() } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0]?.outcome).toBe('passed');
    expect(JSON.stringify(r.results) + r.report).not.toContain(CREDENTIAL);
  });
});
