import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';
import { loadSchema } from '../../src/core/schema/load-schema';
import { locateOperation } from '../../src/core/lang/operation-source';
import { getCompletionsAt, getOperationDiagnostics, getVariablesJsonSchemaFor } from '../../src/core/lang/graphql-language';

const FIXTURE = fileURLToPath(new URL('./fixtures/demo.graphql', import.meta.url));

// 1 salvo: 1
// 2 request:
// 3   url: "{{baseUrl}}/graphql"
// 4   operation: |
// 5     query U($id: ID!) {
// 6       user(id: $id) {
// 7         id
// 8         wrong
// 9       }
// 10    }
const DOC = `salvo: 1
request:
  url: "{{baseUrl}}/graphql"
  operation: |
    query U($id: ID!) {
      user(id: $id) {
        id
        wrong
      }
    }
cases:
  - name: found
    vars: { id: u1 }
    expect: { status: 200 }
`;

describe('graphql layer end to end', () => {
  it('parses, loads the schema from disk, and produces file-positioned language results', async () => {
    const parsed = parseSalvoFile(DOC);
    expect(parsed.ok).toBe(true);

    const loaded = await loadSchema({
      source: { sdl: FIXTURE },
      readFile: async (p) => readFileSync(p, 'utf8'),
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const located = locateOperation(DOC);
    expect(located.ok).toBe(true);
    if (!located.ok) return;

    const issues = getOperationDiagnostics(loaded.schema, located.source);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('wrong');
    expect(issues[0]?.line).toBe(8);
    expect(issues[0]?.col).toBe(9); // indent 4 + op char 4 + 1 ('wrong' sits two levels deep)

    const labels = getCompletionsAt(loaded.schema, located.source, { line: 8, col: 9 }).map((i) => i.label);
    expect(labels).toContain('name');

    const vars = getVariablesJsonSchemaFor(loaded.schema, located.source.text) as { required?: string[] };
    expect(vars.required).toContain('id');
  });
});
