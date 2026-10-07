import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';
import { parseManifest } from '../../src/core/format/parse-manifest';
import { resolveCase } from '../../src/core/vars/resolve-case';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(`../../examples/quickstart/${p}`, import.meta.url)), 'utf8');

const resolvedHeaders = async (fileName: string) => {
  const parsed = parseSalvoFile(read(fileName));
  const manifest = parseManifest(read('salvo.yaml'));
  if (!parsed.ok || !manifest.ok) throw new Error('quickstart files must parse');
  const env = manifest.manifest.environments?.['demo'];
  const out: Array<{ url: string; authorization: string | undefined }> = [];
  for (let i = 0; i < (parsed.file.cases?.length ?? 0); i += 1) {
    const r = await resolveCase({ file: parsed.file, envName: 'demo', env, caseIndex: i, secrets: async () => undefined });
    if (r.kind !== 'resolved') throw new Error(`case ${i} did not resolve`);
    out.push({ url: r.request.url, authorization: r.request.headers['authorization'] });
  }
  return out;
};

describe('quickstart HTTP examples', () => {
  it('bearer: valid, empty, and no token', async () => {
    const url = 'https://httpbin.org/bearer';
    expect(await resolvedHeaders('httpbin-bearer.salvo')).toEqual([
      { url, authorization: 'Bearer demo-token-123' },
      { url, authorization: 'Bearer ' },
      { url, authorization: undefined },
    ]);
  });

  it('basic: right password, wrong password, and no credentials', async () => {
    const url = 'https://httpbin.org/basic-auth/demo/demo-pass';
    expect(await resolvedHeaders('httpbin-basic.salvo')).toEqual([
      { url, authorization: 'Basic ZGVtbzpkZW1vLXBhc3M=' },
      { url, authorization: 'Basic ZGVtbzp3cm9uZw==' },
      { url, authorization: undefined },
    ]);
  });
});
