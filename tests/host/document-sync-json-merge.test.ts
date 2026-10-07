import { describe, it, expect } from 'vitest';
import { applyFieldEdit } from '../../src/host/document-sync';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const head = 'salvo: 1\nrequest:\n  method: POST\n  url: "http://x.test"\n  body:\n';
const tail = 'cases:\n  - name: one\n';
const edit = (json: string, text: string) => applyFieldEdit(`${head}${json}${tail}`, { kind: 'jsonBody', text });

describe('applyFieldEdit jsonBody rebuilds only what changed', () => {
  it('keeps the formatting and comments of untouched entries', () => {
    const r = edit('    json:\n      # keep me\n      price: 10.0\n      name: a # inner\n', '{"price":10,"name":"b"}');
    expect(r.ok && r.text).toBe(`${head}    json:\n      # keep me\n      price: 10.0\n      name: b # inner\n${tail}`);
  });

  it('patches nested maps in place', () => {
    const r = edit('    json:\n      user:\n        name: a\n        n: 1.50\n', '{"user":{"name":"z","n":1.5}}');
    expect(r.ok && r.text).toBe(`${head}    json:\n      user:\n        name: z\n        n: 1.50\n${tail}`);
  });

  it('removes and adds keys', () => {
    const r = edit('    json:\n      a: 1 # one\n      b: 2\n', '{"a":1,"c":[1,2]}');
    expect(r.ok && r.text).toBe(`${head}    json:\n      a: 1 # one\n      c:\n        - 1\n        - 2\n${tail}`);
  });

  it('patches an array of the same length element by element, in flow style', () => {
    const r = edit('    json: { tags: [ a, b ], n: 1.0 }\n', '{"tags":["a","c"],"n":1}');
    expect(r.ok && r.text).toBe(`${head}    json: { tags: [ a, c ], n: 1.0 }\n${tail}`);
  });

  it('replaces the value when its type changes', () => {
    const r = edit('    json: { a: 1 }\n', '[1,2]');
    expect(r.ok && r.text).toBe(`${head}    json: [ 1, 2 ]\n${tail}`);
  });

  it('replaces a map with non-string keys instead of duplicating a key', () => {
    const r = edit('    json:\n      1: x\n      b: 2\n', '{"1":"x","b":3}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = parseSalvoFile(r.text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file.request).toMatchObject({ body: { json: { '1': 'x', b: 3 } } });
    expect(r.text.match(/1"?: x/g)).toHaveLength(1);
  });
});
