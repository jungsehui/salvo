import { describe, it, expect } from 'vitest';
import { applyFieldEdit } from '../../src/host/document-sync';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const HTTP = `salvo: 1
request:
  method: POST
  url: "http://x.test/users" # endpoint
  body:
    json: { name: "{{name}}", age: 30 }
cases:
  - name: one
`;

const requestOf = (text: string) => {
  const parsed = parseSalvoFile(text);
  if (!parsed.ok) throw new Error(parsed.issues[0]?.message);
  return parsed.file.request;
};

describe('applyFieldEdit (HTTP requests)', () => {
  it('switches the method and keeps the rest of the file', () => {
    const r = applyFieldEdit(HTTP, { kind: 'method', method: 'PUT' });
    expect(r.ok && r.text).toBe(HTTP.replace('method: POST', 'method: PUT'));
  });

  it('creates the method key when the request relies on the GET default', () => {
    const text = 'salvo: 1\nrequest:\n  url: "http://x.test" # endpoint\ncases:\n  - name: a\n';
    const r = applyFieldEdit(text, { kind: 'method', method: 'DELETE' });
    expect(r.ok && r.text).toBe('salvo: 1\nrequest:\n  url: "http://x.test" # endpoint\n  method: DELETE\ncases:\n  - name: a\n');
  });

  it('refuses GET while the request has a body', () => {
    const r = applyFieldEdit(HTTP, { kind: 'method', method: 'GET' });
    expect(r).toEqual({
      ok: false,
      error: 'This change would make the file invalid: A GET request cannot have a body. Set request.method (for example POST) or remove request.body.',
    });
  });

  it('replaces the JSON body as one small edit and keeps the flow style', () => {
    const r = applyFieldEdit(HTTP, { kind: 'jsonBody', text: '{\n  "name": "{{name}}",\n  "age": 31\n}' });
    expect(r.ok && r.text).toBe(HTTP.replace('age: 30', 'age: 31'));
    const at = HTTP.indexOf('30');
    expect(r.ok && r.replace).toEqual({ start: at + 1, end: at + 2, text: '1' });
  });

  it('writes a block-style body back as block style and keeps comments elsewhere', () => {
    const text = HTTP.replace('json: { name: "{{name}}", age: 30 }', 'json:\n      name: "{{name}}"');
    const r = applyFieldEdit(text, { kind: 'jsonBody', text: '{"name":"x","tags":["a"]}' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(requestOf(r.text)).toMatchObject({ body: { json: { name: 'x', tags: ['a'] } } });
    expect(r.text).toContain('# endpoint');
  });

  it('refuses invalid JSON and leaves the file alone', () => {
    const r = applyFieldEdit(HTTP, { kind: 'jsonBody', text: '{ "name": ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^The body is not valid JSON: /);
  });

  it('is a no-op when the JSON value did not change', () => {
    expect(applyFieldEdit(HTTP, { kind: 'jsonBody', text: '{"name":"{{name}}","age":30}' })).toEqual({ ok: true, text: HTTP });
  });

  it('refuses a JSON body edit when the file has no json body', () => {
    const graphql = 'salvo: 1\nrequest:\n  url: "http://x.test"\n  operation: "query { ok }"\n';
    expect(applyFieldEdit(graphql, { kind: 'jsonBody', text: '{}' })).toEqual({
      ok: false,
      error: 'request.body.json is missing; add it in the text editor.',
    });
  });
});
