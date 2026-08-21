import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createFetchTransport } from '../../src/core/http/fetch-transport';
import type { ResolvedRequest } from '../../src/core/types';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/json') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Echo-Method': req.method ?? '',
          'X-Echo-CT': req.headers['content-type'] ?? '',
        });
        res.end(JSON.stringify({ received: JSON.parse(body) }));
      });
    } else if (req.url === '/notjson') {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end('<html>bad gateway</html>');
    } else if (req.url === '/slow') {
      setTimeout(() => { res.writeHead(200); res.end('{}'); }, 5_000);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const req = (url: string, timeoutMs = 30_000): ResolvedRequest => ({
  method: 'POST',
  url,
  headers: { 'content-type': 'application/json' },
  body: { query: 'query { ok }', variables: { a: 1 } },
  timeoutMs,
});

describe('createFetchTransport', () => {
  const send = createFetchTransport();

  it('POSTs the GraphQL-over-HTTP body and normalizes the response', async () => {
    const r = await send(req(`${base}/json`));
    expect(r.status).toBe(200);
    expect(r.headers['x-echo-method']).toBe('POST');           // header keys lower-cased
    expect((r.json as { received: { query: string } }).received.query).toBe('query { ok }');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('lets a case-variant Content-Type override the default instead of comma-joining', async () => {
    const custom = { ...req(`${base}/json`), headers: { 'Content-Type': 'application/graphql-response+json' } };
    const r = await send(custom);
    expect(r.headers['x-echo-ct']).toBe('application/graphql-response+json');
  });

  it('keeps a non-JSON body as text with json undefined', async () => {
    const r = await send(req(`${base}/notjson`));
    expect(r.status).toBe(502);
    expect(r.json).toBeUndefined();
    expect(r.bodyText).toContain('bad gateway');
  });

  it('rejects with a timeout error when the server is slower than timeoutMs', async () => {
    await expect(send(req(`${base}/slow`, 200))).rejects.toThrow(/timed out after 200ms/);
  });
});
