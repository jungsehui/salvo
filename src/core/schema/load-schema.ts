import type { SchemaSource } from '../generated/salvo-manifest';
import type { ParseIssue } from '../types';
import type { GraphQLSchema } from 'graphql';

export type HttpPost = (url: string, headers: Record<string, string>, body: unknown) => Promise<string>;

/**
 * Issue positions are relative to the schema SOURCE named in the message
 * (the SDL or introspection file, or the url), NOT the `.salvo` file.
 */
export type LoadSchemaResult =
  | { ok: true; schema: GraphQLSchema }
  | { ok: false; issues: ParseIssue[] };

const fail = (message: string): { ok: false; issues: ParseIssue[] } => ({
  ok: false,
  issues: [{ message, line: 1, col: 1, severity: 'error' }],
});

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function loadSchema(args: {
  source: SchemaSource;
  readFile: (path: string) => Promise<string>;
  httpPost?: HttpPost;
}): Promise<LoadSchemaResult> {
  const { source, readFile, httpPost } = args;
  const set = [source.sdl, source.introspection, source.url].filter((v) => v !== undefined);
  if (set.length !== 1) {
    return fail('Exactly one of schema.sdl, schema.introspection, or schema.url must be set.');
  }

  // Lazy: ~40-50ms cold module load must never ride on extension activation.
  const graphql = await import('graphql');

  if (source.sdl !== undefined) {
    let text: string;
    try {
      text = await readFile(source.sdl);
    } catch (e) {
      return fail(`Cannot read SDL file "${source.sdl}": ${msg(e)}`);
    }
    try {
      return { ok: true, schema: graphql.buildSchema(text) };
    } catch (e) {
      const loc = e instanceof graphql.GraphQLError ? e.locations?.[0] : undefined;
      return {
        ok: false,
        issues: [{ message: `${source.sdl}: ${msg(e)}`, line: loc?.line ?? 1, col: loc?.column ?? 1, severity: 'error' }],
      };
    }
  }

  if (source.introspection !== undefined) {
    let text: string;
    try {
      text = await readFile(source.introspection);
    } catch (e) {
      return fail(`Cannot read introspection file "${source.introspection}": ${msg(e)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail(`${source.introspection}: not valid JSON.`);
    }
    const payload = (json as { data?: unknown }).data ?? json;
    try {
      return { ok: true, schema: graphql.buildClientSchema(payload as never) };
    } catch (e) {
      return fail(`${source.introspection}: ${msg(e)}`);
    }
  }

  if (!httpPost) {
    return fail('schema.url requires a network transport, which was not provided.');
  }
  let body: string;
  try {
    body = await httpPost(
      source.url!,
      { 'content-type': 'application/json', ...(source.headers ?? {}) },
      { query: graphql.getIntrospectionQuery() }
    );
  } catch (e) {
    return fail(`Introspection request to "${source.url}" failed: ${msg(e)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(`Introspection response from "${source.url}" is not valid JSON.`);
  }
  const data = (json as { data?: unknown }).data;
  if (!data) {
    return fail(`Introspection response from "${source.url}" has no data (introspection may be disabled on the server).`);
  }
  try {
    return { ok: true, schema: graphql.buildClientSchema(data as never) };
  } catch (e) {
    return fail(`"${source.url}": ${msg(e)}`);
  }
}
