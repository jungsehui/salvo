import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema } from 'graphql';
import { collectDiagnostics, completionsInFile, hoverInFile, completionsInOperation, diagnosticsInOperation, hoverInOperation } from '../../src/host/salvo-language';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../core/fixtures/demo.graphql', import.meta.url)), 'utf8'));

// 1 salvo: 1 / 2 request: / 3 url / 4 operation: | / 5 query / 6 me { nope } / 7 }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Bad {
      me { nope }
    }
`;

describe('salvo-language glue', () => {
  it('combines parse warnings and operation diagnostics', () => {
    const issues = collectDiagnostics(DOC, schema);
    expect(issues.some((i) => i.message.includes('nope') && i.line === 6)).toBe(true);
  });

  it('returns parse issues alone when there is no schema', () => {
    const issues = collectDiagnostics(DOC, undefined);
    expect(issues.every((i) => !i.message.includes('nope'))).toBe(true);
  });

  it('returns YAML/schema errors for a broken file without touching the language layer', () => {
    const issues = collectDiagnostics('salvo: 1\nrequest: [unclosed', schema);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe('error');
  });

  it('completes and hovers at file positions, and stays quiet without a schema', () => {
    expect(completionsInFile(DOC, schema, { line: 6, col: 12 }).map((i) => i.label)).toContain('id');
    expect(hoverInFile(DOC, schema, { line: 6, col: 8 })).toContain('User');
    expect(completionsInFile(DOC, undefined, { line: 6, col: 12 })).toEqual([]);
    expect(hoverInFile(DOC, undefined, { line: 6, col: 8 })).toBeUndefined();
  });
});

describe('operation-relative language ops', () => {
  const text = 'query Bad {\n  me { nope }\n}\n';
  it('serves completions, diagnostics, and hover in text coordinates', () => {
    expect(completionsInOperation(schema, text, { line: 1, character: 7 }).map((c) => c.label)).toContain('id');
    expect(diagnosticsInOperation(schema, text)).toEqual([
      expect.objectContaining({ start: { line: 1, character: 7 }, end: { line: 1, character: 12 }, severity: 'error' }),
    ]);
    expect(hoverInOperation(schema, text, { line: 1, character: 3 })).toBe('Query.me: User');
  });
  it('stays quiet without a schema', () => {
    expect(completionsInOperation(undefined, text, { line: 1, character: 7 })).toEqual([]);
    expect(diagnosticsInOperation(undefined, text)).toEqual([]);
    expect(hoverInOperation(undefined, text, { line: 1, character: 3 })).toBeUndefined();
  });
});
