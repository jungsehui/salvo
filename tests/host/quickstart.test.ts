import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema } from 'graphql';
import { collectDiagnostics } from '../../src/host/salvo-language';
import { parseManifest } from '../../src/core/format/parse-manifest';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(`../../examples/quickstart/${p}`, import.meta.url)), 'utf8');

describe('quickstart example', () => {
  it('points its manifest at the bundled SDL', () => {
    const m = parseManifest(read('salvo.yaml'));
    expect(m.ok && m.manifest.schema).toEqual({ sdl: './countries.graphql' });
  });

  it('has no errors against its own schema', () => {
    const schema = buildSchema(read('countries.graphql'));
    const errors = collectDiagnostics(read('countries.salvo'), schema).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });
});
