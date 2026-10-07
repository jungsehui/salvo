import { describe, it, expect } from 'vitest';
import { buildGraphqlRequest } from '../../src/core/request/build-graphql';
import { Substituter } from '../../src/core/vars/substitute';

const secrets = async (n: string) => (n === 'T' ? 'sec-1' : undefined);

describe('buildGraphqlRequest', () => {
  it('builds the same POST payload as 0.1', async () => {
    const sub = new Substituter({ base: 'http://x.test', cursor: 'c-1', token: '{{secret:T}}' }, secrets);
    const r = await buildGraphqlRequest(
      {
        url: '{{base}}/graphql',
        headers: { authorization: 'Bearer {{token}}' },
        operation: 'query Q { a }',
        operationName: 'Q',
        variables: { first: 10, cursor: '{{cursor}}', nested: { keep: '{{cursor}}' } },
        timeoutMs: 500,
      },
      { 'x-env': 'test' },
      sub
    );
    expect(r).toEqual({
      method: 'POST',
      url: 'http://x.test/graphql',
      headers: { 'x-env': 'test', authorization: 'Bearer sec-1' },
      body: { query: 'query Q { a }', variables: { first: 10, cursor: 'c-1', nested: { keep: '{{cursor}}' } }, operationName: 'Q' },
      timeoutMs: 500,
    });
    expect(sub.problems()).toBeUndefined();
  });

  it('lets a request header win over an environment header that differs only in case', async () => {
    const r = await buildGraphqlRequest(
      { url: 'http://x.test', headers: { authorization: 'request' }, operation: 'q' },
      { Authorization: 'env' },
      new Substituter({}, secrets)
    );
    expect(r.headers).toEqual({ authorization: 'request' });
  });

  it('omits a header whose single placeholder is null, but keeps an empty string', async () => {
    const sub = new Substituter({ a: null, b: '' }, secrets);
    const r = await buildGraphqlRequest({ url: 'http://x.test', headers: { 'x-a': '{{a}}', 'x-b': '{{b}}' }, operation: 'q' }, undefined, sub);
    expect(r.headers).toEqual({ 'x-b': '' });
  });

  it('defaults the timeout to 30 seconds', async () => {
    const r = await buildGraphqlRequest({ url: 'http://x.test', operation: 'q' }, undefined, new Substituter({}, secrets));
    expect(r.timeoutMs).toBe(30_000);
  });
});
