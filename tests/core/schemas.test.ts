import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import fileSchema from '../../schemas/salvo-file.schema.json';
import manifestSchema from '../../schemas/salvo-manifest.schema.json';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

describe('salvo-file schema', () => {
  const validate = ajv.compile(fileSchema);

  it('accepts a minimal valid file', () => {
    expect(validate({ salvo: 1, request: { url: 'https://x.test/graphql', operation: 'query { ok }' } })).toBe(true);
  });

  it('accepts the full spec example including cases and expect', () => {
    const doc = {
      salvo: 1,
      request: { method: 'POST', url: '{{baseUrl}}/graphql', operation: 'query Me { me { id } }' },
      vars: { region: 'eu' },
      cases: [
        {
          name: 'valid token',
          vars: { token: '{{secret:VALID_TOKEN}}' },
          expect: { status: 200, json: { 'data.me.id': { exists: true }, errors: { exists: false } } },
        },
        { name: 'expired', environments: ['local'], expect: { status: '4xx' } },
      ],
    };
    expect(validate(doc)).toBe(true);
  });

  it('rejects a missing version key', () => {
    expect(validate({ request: { url: 'x', operation: 'q' } })).toBe(false);
  });

  it('rejects a matcher object with two keys', () => {
    const doc = {
      salvo: 1,
      request: { url: 'x', operation: 'q' },
      cases: [{ name: 'a', expect: { json: { p: { exists: true, contains: 'x' } } } }],
    };
    expect(validate(doc)).toBe(false);
  });

  it('allows unknown top-level keys (forward compatibility)', () => {
    expect(validate({ salvo: 1, request: { url: 'x', operation: 'q' }, futureField: 1 })).toBe(true);
  });
});

describe('salvo-manifest schema', () => {
  const validate = ajv.compile(manifestSchema);

  it('accepts a manifest with environments and schema source', () => {
    const doc = {
      salvo: 1,
      id: '550e8400-e29b-41d4-a716-446655440000',
      environments: {
        local: { vars: { baseUrl: 'http://localhost:4000' }, headers: { 'x-env': 'local' } },
        prod: { vars: { baseUrl: 'https://api.example.com' } },
      },
      schema: { sdl: './schema.graphql' },
    };
    expect(validate(doc)).toBe(true);
  });

  it('rejects a manifest without id', () => {
    expect(validate({ salvo: 1, environments: {} })).toBe(false);
  });
});
