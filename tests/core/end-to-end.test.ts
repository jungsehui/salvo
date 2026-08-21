import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';
import { parseManifest } from '../../src/core/format/parse-manifest';
import { runCases } from '../../src/core/runner/run-cases';
import { createFetchTransport } from '../../src/core/http/fetch-transport';

// Local stand-in for the public demo API, same shape, so CI needs no network.
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { variables } = JSON.parse(body) as { variables?: { code?: string } };
      const found = variables?.code === 'EU';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { continent: found ? { name: 'Europe', countries: [{ code: 'DE' }] } : null } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('quickstart end to end', () => {
  it('parses the shipped example files and runs both cases', async () => {
    const fileText = readFileSync(fileURLToPath(new URL('../../examples/quickstart/countries.salvo', import.meta.url)), 'utf8');
    const manifestText = readFileSync(fileURLToPath(new URL('../../examples/quickstart/salvo.yaml', import.meta.url)), 'utf8');

    const parsedFile = parseSalvoFile(fileText);
    const parsedManifest = parseManifest(manifestText);
    expect(parsedFile.ok).toBe(true);
    expect(parsedManifest.ok).toBe(true);
    if (!parsedFile.ok || !parsedManifest.ok) return;

    // Point the demo environment at the local fixture server.
    const manifest = structuredClone(parsedManifest.manifest);
    manifest.environments!.demo!.vars!.baseUrl = base;

    const results = await runCases({
      file: parsedFile.file,
      envName: 'demo',
      manifest,
      selected: 'all',
      deps: { secrets: async () => undefined, send: createFetchTransport() },
    });

    expect(results.map((r) => [r.caseName, r.outcome])).toEqual([
      ['Europe exists', 'passed'],
      ['unknown code returns null', 'passed'],
    ]);
  });
});
