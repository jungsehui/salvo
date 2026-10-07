import { describe, it, expect } from 'vitest';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const HTTP = `salvo: 1
request:
  method: POST
  url: "{{base}}/users"
  query: { page: 1 }
  headers:
    x-trace: "{{trace}}"
  body:
    json: { name: "{{name}}" }
cases:
  - name: create
    expect: { status: 201 }
`;

describe('parseSalvoFile (HTTP requests)', () => {
  it('accepts an HTTP request (a request without operation)', () => {
    const r = parseSalvoFile(HTTP);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.issues).toEqual([]);
  });

  it("reports only the chosen shape's errors and names the allowed methods", () => {
    const r = parseSalvoFile('salvo: 1\nrequest:\n  method: get\n  url: x\n');
    expect(r.ok).toBe(false);
    const messages = r.issues.map((i) => i.message).join('\n');
    expect(messages).toContain(
      '/request/method must be equal to one of the allowed values: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'
    );
    expect(messages).not.toContain('oneOf');
    expect(messages).not.toContain("required property 'operation'");
  });

  it('rejects a body on GET, including the GET default, at the body', () => {
    for (const methodLine of ['  method: GET\n', '']) {
      const r = parseSalvoFile(`salvo: 1\nrequest:\n${methodLine}  url: x\n  body:\n    text: hi\n`);
      expect(r.ok).toBe(false);
      expect(r.issues[0]?.message).toBe(
        'A GET request cannot have a body. Set request.method (for example POST) or remove request.body.'
      );
    }
    const atBody = parseSalvoFile('salvo: 1\nrequest:\n  url: x\n  body:\n    text: hi\n');
    expect(atBody.issues[0]?.line).toBe(5);
  });

  it('rejects zero or two body kinds', () => {
    const empty = parseSalvoFile('salvo: 1\nrequest:\n  method: POST\n  url: x\n  body: {}\n');
    expect(empty.ok).toBe(false);
    expect(empty.issues.map((i) => i.message)).toContain('request.body must contain exactly one of json, text, form.');
    const two = parseSalvoFile('salvo: 1\nrequest:\n  method: POST\n  url: x\n  body:\n    text: a\n    form: { b: c }\n');
    expect(two.issues.map((i) => i.message)).toContain('request.body must contain exactly one of json, text, form.');
  });

  it('rejects HTTP-only keys in a GraphQL request at the key', () => {
    const r = parseSalvoFile('salvo: 1\nrequest:\n  url: x\n  operation: "query { ok }"\n  query: { a: 1 }\n');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toBe(
      'request.query is for HTTP requests; a GraphQL request sends its operation as the body.'
    );
    expect(r.issues[0]?.line).toBe(5);
  });

  it('rejects GraphQL-only keys in an HTTP request', () => {
    const r = parseSalvoFile('salvo: 1\nrequest:\n  url: x\n  variables: { a: 1 }\n');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toBe(
      'request.variables is for GraphQL requests; this request has no operation, so it is an HTTP request.'
    );
  });

  it('rejects auth.basic together with an authorization header, whatever its case', () => {
    const r = parseSalvoFile(
      'salvo: 1\nrequest:\n  url: x\n  headers: { Authorization: "Bearer t" }\n  auth:\n    basic: { username: u }\n'
    );
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toBe('Use either request.auth or an authorization header, not both.');
  });

  it('rejects an unknown body kind through the schema', () => {
    const r = parseSalvoFile('salvo: 1\nrequest:\n  method: POST\n  url: x\n  body:\n    xml: "<a/>"\n');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toContain('/request/body must NOT have additional properties');
  });

  it('never applies the operation placeholder warning to HTTP files', () => {
    const r = parseSalvoFile('salvo: 1\nrequest:\n  url: "{{base}}/x"\n  headers: { a: "{{b}}" }\n');
    expect(r.ok && r.issues).toEqual([]);
  });
});
