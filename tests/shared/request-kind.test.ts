import { describe, it, expect } from 'vitest';
import { HTTP_METHODS, isGraphqlRequest, isHttpMethod } from '../../src/shared/request-kind';

describe('request kind', () => {
  it('treats a request with a string operation as GraphQL and anything else as HTTP', () => {
    expect(isGraphqlRequest({ url: 'x', operation: 'q' })).toBe(true);
    expect(isGraphqlRequest({ url: 'x' })).toBe(false);
    expect(isGraphqlRequest({ url: 'x', method: 'GET' })).toBe(false);
  });

  it('lists the seven methods and validates untrusted strings', () => {
    expect(HTTP_METHODS).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
    expect(isHttpMethod('PATCH')).toBe(true);
    expect(isHttpMethod('patch')).toBe(false);
    expect(isHttpMethod(1)).toBe(false);
  });
});
