import type { SecretResolver } from '../core/types';

/** Structural subset of vscode.SecretStorage; a Map-backed fake satisfies it in tests. */
export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
  keys(): PromiseLike<string[]>;
}

const PREFIX = 'salvo/v1';
const enc = encodeURIComponent;

export function makeSecretKey(projectId: string, envName: string, name: string): string {
  return `${PREFIX}/${enc(projectId)}/${enc(envName)}/${enc(name)}`;
}

export function createSecretResolver(store: SecretStore, projectId: string, envName: string): SecretResolver {
  return async (name) => (await store.get(makeSecretKey(projectId, envName, name))) ?? undefined;
}

export async function listSecretNames(store: SecretStore, projectId: string, envName: string): Promise<string[]> {
  const prefix = `${PREFIX}/${enc(projectId)}/${enc(envName)}/`;
  return (await store.keys())
    .filter((k) => k.startsWith(prefix))
    .map((k) => decodeURIComponent(k.slice(prefix.length)))
    .sort();
}
