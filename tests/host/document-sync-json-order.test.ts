import { describe, it, expect } from 'vitest';
import { applyFieldEdit } from '../../src/host/document-sync';

const head = 'salvo: 1\nrequest:\n  method: POST\n  url: "http://x.test"\n  body:\n';
const tail = 'cases:\n  - name: one\n';
const edit = (json: string, text: string) => applyFieldEdit(`${head}${json}${tail}`, { kind: 'jsonBody', text });

describe('applyFieldEdit jsonBody follows the edited key order', () => {
  it('applies a reorder-only edit', () => {
    const r = edit('    json:\n      a: 1 # one\n      b: 2\n', '{"b":2,"a":1}');
    expect(r.ok && r.text).toBe(`${head}    json:\n      b: 2\n      a: 1 # one\n${tail}`);
  });

  it('inserts a new key where the user put it', () => {
    const r = edit('    json:\n      # top\n      a: 1 # one\n      b: 2\n', '{"a":1,"n":"x","b":2}');
    expect(r.ok && r.text).toBe(`${head}    json:\n      # top\n      a: 1 # one\n      n: x\n      b: 2\n${tail}`);
  });

  it('keeps flow style while inserting', () => {
    const r = edit('    json: { a: 1, b: 2 }\n', '{"a":1,"n":3,"b":2}');
    expect(r.ok && r.text).toBe(`${head}    json: { a: 1, n: 3, b: 2 }\n${tail}`);
  });
});
