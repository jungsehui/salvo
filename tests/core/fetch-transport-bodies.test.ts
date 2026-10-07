import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createFetchTransport } from '../../src/core/http/fetch-transport';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, contentType: req.headers['content-type'] ?? null, body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('createFetchTransport with HTTP bodies', () => {
  const send = createFetchTransport();

  it("sends an encoded body as is, with the builder's content type", async () => {
    const r = await send({
      method: 'PUT',
      url: `${base}/x`,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: { kind: 'encoded', text: 'hello' },
      timeoutMs: 5000,
    });
    expect(r.json).toEqual({ method: 'PUT', contentType: 'text/plain; charset=utf-8', body: 'hello' });
  });

  it('sends no body and no default content type when there is no body', async () => {
    const r = await send({ method: 'GET', url: `${base}/x`, headers: {}, body: { kind: 'none' }, timeoutMs: 5000 });
    expect(r.json).toEqual({ method: 'GET', contentType: null, body: '' });
  });

  it('handles HEAD, whose response has no body', async () => {
    const r = await send({ method: 'HEAD', url: `${base}/x`, headers: {}, body: { kind: 'none' }, timeoutMs: 5000 });
    expect(r.status).toBe(200);
    expect(r.bodyText).toBe('');
    expect(r.json).toBeUndefined();
  });
});
