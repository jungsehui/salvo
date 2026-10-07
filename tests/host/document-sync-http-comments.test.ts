import { describe, it, expect } from 'vitest';
import { applyFieldEdit } from '../../src/host/document-sync';

const head = 'salvo: 1\nrequest:\n  method: POST\n  url: "http://x.test"\n  body:\n';
const tail = 'cases:\n  - name: one\n';

describe('applyFieldEdit jsonBody keeps comments on the json line', () => {
  it('keeps a trailing comment on a flow-style body', () => {
    const text = `${head}    json: { a: 1 } # keep me\n${tail}`;
    const r = applyFieldEdit(text, { kind: 'jsonBody', text: '{"a":2}' });
    expect(r.ok && r.text).toBe(`${head}    json: { a: 2 } # keep me\n${tail}`);
  });

  it('keeps the comment after json: on a block-style body', () => {
    const text = `${head}    json: # the payload\n      a: 1\n${tail}`;
    const r = applyFieldEdit(text, { kind: 'jsonBody', text: '{"a":2,"b":[1]}' });
    expect(r.ok && r.text).toBe(`${head}    json:\n      # the payload\n      a: 2\n      b:\n        - 1\n${tail}`);
  });
});
