import { describe, it, expect } from 'vitest';
import { createSecretResolver, listSecretNames, makeSecretKey, type SecretStore } from '../../src/host/secrets';

const fake = (): SecretStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k),
    store: async (k, v) => void map.set(k, v),
    delete: async (k) => void map.delete(k),
    keys: async () => [...map.keys()],
  };
};

describe('secrets', () => {
  it('composes namespaced keys with encoded parts', () => {
    expect(makeSecretKey('proj-1', 'dev', 'TOKEN')).toBe('salvo/v1/proj-1/dev/TOKEN');
    expect(makeSecretKey('proj-1', 'eu/west', 'TOKEN')).toBe('salvo/v1/proj-1/eu%2Fwest/TOKEN');
  });

  it('resolves secrets scoped to project and environment', async () => {
    const store = fake();
    await store.store(makeSecretKey('p1', 'dev', 'TOKEN'), 'dev-secret');
    await store.store(makeSecretKey('p1', 'prod', 'TOKEN'), 'prod-secret');
    const resolver = createSecretResolver(store, 'p1', 'dev');
    expect(await resolver('TOKEN')).toBe('dev-secret');
    expect(await resolver('MISSING')).toBeUndefined();
  });

  it('lists only this scope, decoded and sorted', async () => {
    const store = fake();
    await store.store(makeSecretKey('p1', 'eu/west', 'B_TOKEN'), 'x');
    await store.store(makeSecretKey('p1', 'eu/west', 'A_TOKEN'), 'y');
    await store.store(makeSecretKey('p1', 'dev', 'OTHER'), 'z');
    await store.store('unrelated/key', 'w');
    expect(await listSecretNames(store, 'p1', 'eu/west')).toEqual(['A_TOKEN', 'B_TOKEN']);
  });
});
