import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import fileSchema from '../../schemas/salvo-file.schema.json';

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(fileSchema);

describe('salvo-file schema: HTTP requests', () => {
  it('accepts an HTTP request with query, headers, a body, and basic auth', () => {
    expect(
      validate({
        salvo: 1,
        request: {
          method: 'PUT',
          url: 'x',
          query: { p: 1, s: null },
          headers: { a: 'b' },
          body: { form: { a: 1, b: true } },
          auth: { basic: { username: 'u', password: 'p' } },
        },
      })
    ).toBe(true);
  });

  it('accepts any JSON value as a json body', () => {
    for (const json of [{ a: 1 }, [1, 'x', null], 'text', 3, true, null]) {
      expect(validate({ salvo: 1, request: { method: 'POST', url: 'x', body: { json } } })).toBe(true);
    }
  });

  it('keeps the two shapes exclusive on operation', () => {
    expect(validate({ salvo: 1, request: { url: 'x', operation: 'q' } })).toBe(true);
    expect(validate({ salvo: 1, request: { method: 'GET', url: 'x', operation: 'q' } })).toBe(false);
  });

  it('rejects unknown methods and body kinds', () => {
    expect(validate({ salvo: 1, request: { method: 'get', url: 'x' } })).toBe(false);
    expect(validate({ salvo: 1, request: { method: 'POST', url: 'x', body: { xml: '<a/>' } } })).toBe(false);
  });
});
