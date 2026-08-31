import { describe, it, expect } from 'vitest';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const VALID = `salvo: 1
request:
  url: "{{baseUrl}}/graphql"
  operation: |
    query Me { me { id } }
cases:
  - name: valid token
    vars: { token: "{{secret:T}}" }
    expect:
      status: 200
`;

describe('parseSalvoFile', () => {
  it('parses a valid file', () => {
    const r = parseSalvoFile(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.request.url).toBe('{{baseUrl}}/graphql');
      expect(r.file.cases?.[0]?.name).toBe('valid token');
      expect(r.issues).toEqual([]);
    }
  });

  it('reports YAML syntax errors with 1-based line/col', () => {
    const r = parseSalvoFile('salvo: 1\nrequest: [unclosed');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.severity).toBe('error');
    expect(r.issues[0]?.line).toBe(2);
    expect(r.issues[0]?.col).toBe(19); // 1-based column of the offending token
  });

  it('reports schema violations at the offending node line', () => {
    const bad = 'salvo: 1\nrequest:\n  url: 1\n  operation: q\n';
    const r = parseSalvoFile(bad);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.message.includes('/request/url'));
    expect(issue?.line).toBe(3);
    expect(issue?.col).toBe(8); // 1-based column of the offending value node
  });

  it('warns when the operation body contains {{ (substitution is forbidden there)', () => {
    const withVar = VALID.replace('query Me { me { id } }', 'query Me { me(id: "{{id}}") { id } }');
    const r = parseSalvoFile(withVar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.issues.some((i) => i.severity === 'warning' && i.message.includes('operation'))).toBe(true);
  });

  it('warns on duplicate case names', () => {
    const dup = VALID + '  - name: valid token\n';
    const r = parseSalvoFile(dup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.issues.some((i) => i.message.includes('Duplicate case name'))).toBe(true);
  });

  it('decodes JSON-pointer escapes in schema-violation paths', () => {
    const bad = 'salvo: 1\nrequest:\n  url: x\n  operation: q\n  headers:\n    a/b: 1\n';
    const r = parseSalvoFile(bad);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.message.includes('headers'));
    expect(issue?.message).toContain('a/b');       // decoded, not a~1b
    expect(issue?.message).not.toContain('a~1b');
    expect(issue?.line).toBe(6);                    // position resolved through the decoded path
  });
});
