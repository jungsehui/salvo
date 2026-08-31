import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema } from 'graphql';
import { locateOperation } from '../../src/core/lang/operation-source';
import {
  getCompletionsAt,
  getHoverAt,
  getOperationDiagnostics,
  getVariablesJsonSchemaFor,
} from '../../src/core/lang/graphql-language';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('./fixtures/demo.graphql', import.meta.url)), 'utf8'));

// 1 salvo: 1
// 2 request:
// 3   url: "http://x.test/graphql"
// 4   operation: |
// 5     query Bad {
// 6       me { nope }
// 7     }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Bad {
      me { nope }
    }
`;

const op = (() => {
  const r = locateOperation(DOC);
  if (!r.ok) throw new Error(r.reason);
  return r.source;
})();

describe('graphql-language', () => {
  it('maps diagnostics onto FILE positions', () => {
    const issues = getOperationDiagnostics(schema, op);
    expect(issues.length).toBeGreaterThan(0);
    const bad = issues[0]!;
    expect(bad.message).toContain('nope');
    expect(bad.severity).toBe('error');
    expect(bad.line).toBe(6);   // 'nope' is on file line 6
    expect(bad.col).toBe(12);   // indent 4 + op char 7 + 1
  });

  it('returns zero diagnostics for a valid operation', () => {
    const ok = locateOperation(DOC.replace('nope', 'id'));
    if (!ok.ok) throw new Error(ok.reason);
    expect(getOperationDiagnostics(schema, ok.source)).toEqual([]);
  });

  it('completes fields at a file position inside the selection set', () => {
    const items = getCompletionsAt(schema, op, { line: 6, col: 12 });
    const labels = items.map((i) => i.label);
    expect(labels).toContain('id');
    expect(labels).toContain('friends');
  });

  it('returns no completions for a position outside the operation body', () => {
    expect(getCompletionsAt(schema, op, { line: 3, col: 4 })).toEqual([]);
  });

  it('hovers the me field with its type', () => {
    const hover = getHoverAt(schema, op, { line: 6, col: 8 });
    expect(hover).toContain('User');
  });

  it('builds a variables JSON Schema from operation variable types', () => {
    const text = 'query Q($id: ID!, $first: Int) { user(id: $id) { id } }';
    const js = getVariablesJsonSchemaFor(schema, text) as { properties?: Record<string, unknown>; required?: string[] };
    expect(js.properties?.['id']).toBeDefined();
    expect(js.required).toContain('id');
  });

  it('returns undefined variables schema for an unparsable operation', () => {
    expect(getVariablesJsonSchemaFor(schema, 'query {{{')).toBeUndefined();
  });
});
