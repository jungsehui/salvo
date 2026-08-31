import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { introspectionFromSchema, buildSchema } from 'graphql';
import { loadSchema } from '../../src/core/schema/load-schema';

const SDL = readFileSync(fileURLToPath(new URL('./fixtures/demo.graphql', import.meta.url)), 'utf8');
const files = (map: Record<string, string>) => async (path: string) => {
  const v = map[path];
  if (v === undefined) throw new Error(`ENOENT: ${path}`);
  return v;
};

describe('loadSchema', () => {
  it('loads a schema from an SDL file', async () => {
    const r = await loadSchema({ source: { sdl: './demo.graphql' }, readFile: files({ './demo.graphql': SDL }) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.schema.getType('User')).toBeDefined();
  });

  it('reports SDL syntax errors with the file path and a position', async () => {
    const broken = SDL.replace('type Item {', 'type Item {{');
    const r = await loadSchema({ source: { sdl: './broken.graphql' }, readFile: files({ './broken.graphql': broken }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.message).toContain('./broken.graphql');
      expect(r.issues[0]?.line).toBeGreaterThan(1);
    }
  });

  it('reports an unreadable SDL file as an issue, not a throw', async () => {
    const r = await loadSchema({ source: { sdl: './missing.graphql' }, readFile: files({}) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('Cannot read SDL file "./missing.graphql"');
  });

  it('loads introspection JSON in both bare and data-wrapped shapes', async () => {
    const intro = introspectionFromSchema(buildSchema(SDL));
    const bare = JSON.stringify(intro);
    const wrapped = JSON.stringify({ data: intro });
    for (const text of [bare, wrapped]) {
      const r = await loadSchema({ source: { introspection: './schema.json' }, readFile: files({ './schema.json': text }) });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.schema.getQueryType()?.getFields()['me']).toBeDefined();
    }
  });

  it('reports invalid introspection JSON politely', async () => {
    const r = await loadSchema({ source: { introspection: './schema.json' }, readFile: files({ './schema.json': '<html>' }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('not valid JSON');
  });

  it('loads via url through the injected httpPost', async () => {
    const intro = introspectionFromSchema(buildSchema(SDL));
    const seen: { url?: string; auth?: string } = {};
    const httpPost = async (url: string, headers: Record<string, string>) => {
      seen.url = url;
      seen.auth = headers['authorization'];
      return JSON.stringify({ data: intro });
    };
    const r = await loadSchema({
      source: { url: 'http://api.test/graphql', headers: { authorization: 'Bearer t' } },
      readFile: files({}),
      httpPost,
    });
    expect(r.ok).toBe(true);
    expect(seen.url).toBe('http://api.test/graphql');
    expect(seen.auth).toBe('Bearer t');
  });

  it('explains a data-less introspection response (introspection disabled)', async () => {
    const httpPost = async () => JSON.stringify({ errors: [{ message: 'introspection disabled' }] });
    const r = await loadSchema({ source: { url: 'http://api.test/graphql' }, readFile: files({}), httpPost });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('introspection may be disabled');
  });

  it('requires exactly one source', async () => {
    const none = await loadSchema({ source: {}, readFile: files({}) });
    const two = await loadSchema({ source: { sdl: 'a', url: 'b' }, readFile: files({}) });
    for (const r of [none, two]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]?.message).toContain('Exactly one of');
    }
  });

  it('refuses a url source without a transport', async () => {
    const r = await loadSchema({ source: { url: 'http://api.test/graphql' }, readFile: files({}) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('network transport');
  });
});
