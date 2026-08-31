# Salvo v0.1 GraphQL Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the core a GraphQL brain: load a schema from a local SDL file, an introspection-JSON file, or (opt-in) a live endpoint; map positions between a `.salvo` file and the operation block inside it; and expose autocomplete, diagnostics, hover, and variables-JSON-schema as pure functions with FILE-relative positions. Plus the polish batch parked by plan 1's final review.

**Architecture:** Still pure core — zero `vscode` imports (the existing guard test enforces it). `graphql` is lazy-imported inside `loadSchema` (conventions: never on the activation path). Filesystem and network stay injected (`readFile`, `httpPost`), so everything runs under vitest. `graphql-language-service` pure functions (proven by the 2026-08-21 spike: 7 functions, 246KB schema, sub-ms) are wrapped so all positions crossing the module boundary are 1-based FILE line/col; op-relative 0-based positions never leak out.

**Tech Stack:** adds runtime deps `graphql` (^16.9.0 floor; ^16.14.2 shipped) and `graphql-language-service` (^5.5.2 floor; ^5.7.0 shipped) (3 transitive deps, MIT — architecture decision 6). Everything else unchanged.

**Spec:** `.claude/architecture.md` (decisions 6, 7, 10) and `.claude/roadmap.md` (v0.1 minimum behavior 2–3). Plan 1's interfaces are consumed as shipped: `ParseIssue` (1-based line/col), `SchemaSource` (generated), `Transport`-style injection.

**Plan set:** plan 2 of 3 for v0.1. Plan 3 (VS Code integration) consumes: `loadSchema` (wired to `vscode.workspace.fs` + the fetch transport), `locateOperation` + the lang functions (wired to the editor/webview), and the polish contracts fixed in Task 1.

## Global Constraints

- **Generic by design** (CLAUDE.md hard rule 6): no company values anywhere; test fixtures are synthetic; English-only user-facing strings.
- **No `vscode` import in `src/core/**`** — guard test already enforces.
- **`graphql` is lazy-imported** (`await import('graphql')`) inside `loadSchema` only; `src/core/lang/` may import `graphql-language-service` statically because plan 3 dynamic-imports the whole lang module (conventions lazy-load rule, applied at the module boundary). `graphql` TYPES may be imported with `import type` anywhere (erased at compile time).
- **Schema load failures are a first-class scenario** (architecture decision 6: 5 real SDL files measured, 2 were broken): every failure returns `{ ok: false, issues }` with an English message naming the source; nothing throws.
- **Exactly one schema source**: `schema.sdl` | `schema.introspection` | `schema.url` — zero or more than one set is an error, never a silent pick.
- **All positions crossing a module boundary are 1-based file line/col** (`ParseIssue` convention from plan 1). Internal graphql-language-service positions are 0-based op-relative and stay internal.
- **Node 20+, TS strict clean, kebab-case files, `npm test` + `npm run check` + `npm run gen:check` green at every commit.**

## File Structure

```
src/core/
├─ schema/
│  └─ load-schema.ts        # SchemaSource -> GraphQLSchema | issues (lazy graphql import)
├─ lang/
│  ├─ operation-source.ts   # .salvo text -> operation text + bidirectional position mapping
│  └─ graphql-language.ts   # diagnostics/completions/hover/variables with FILE positions
src/extension.ts             # stub (plan-tree parity; real activation in plan 3)
tests/core/
├─ fixtures/demo.graphql     # synthetic ~15-type schema, shared by tasks 2-5
├─ load-schema.test.ts
├─ operation-source.test.ts
├─ graphql-language.test.ts
└─ graphql-integration.test.ts
```

---

### Task 1: Polish batch parked by plan 1's final review

Six small, independent fixes batched as one dispatch (they share no logic; each has its own test or is doc/stub-only). Findings M1–M5 plus the mutual-cycle coverage gap from the final re-review.

**Files:**
- Modify: `src/core/runner/run-cases.ts` (M1)
- Modify: `schemas/salvo-file.schema.json` + regenerate `src/core/generated/salvo-file.ts` (M2)
- Modify: `src/core/format/parse-salvo-file.ts`, `src/core/format/parse-manifest.ts` (M3)
- Modify: `examples/quickstart/countries.salvo` (M4)
- Create: `src/extension.ts` (M5)
- Modify: `tests/core/run-cases.test.ts`, `tests/core/parse-salvo-file.test.ts`, `tests/core/resolve-case.test.ts`

**Interfaces:**
- Consumes: everything as shipped by plan 1.
- Produces: no signature changes; behavior contracts only (env-not-found error, decoded pointer paths).

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/run-cases.test.ts` (M1):
```ts
  it('reports a helpful error when the named environment does not exist in the manifest', async () => {
    const manifest = { salvo: 1 as const, id: 'proj-12345678', environments: { dev: { vars: { baseUrl: 'http://dev.test' } } } };
    const results = await runCases({ file: FILE, envName: 'prod', manifest, selected: [0], deps });
    expect(results[0]?.outcome).toBe('error');
    expect(results[0]?.error).toContain('Environment "prod" is not defined');
    expect(results[0]?.error).toContain('dev');
  });
```

Append to `tests/core/parse-salvo-file.test.ts` (M3):
```ts
  it('decodes JSON-pointer escapes in schema-violation paths', () => {
    const bad = 'salvo: 1\nrequest:\n  url: x\n  operation: q\n  headers:\n    a/b: 1\n';
    const r = parseSalvoFile(bad);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.message.includes('headers'));
    expect(issue?.message).toContain('a/b');       // decoded, not a~1b
    expect(issue?.message).not.toContain('a~1b');
    expect(issue?.line).toBe(6);                    // position resolved through the decoded path
  });
```

Append to `tests/core/resolve-case.test.ts` (re-review gap):
```ts
  it('reports mutual cycles reached without a case-level override', async () => {
    const file: SalvoFile = {
      salvo: 1,
      request: { url: '{{a}}/g', operation: 'q' },
      vars: { a: '{{b}}', b: '{{a}}' },
      cases: [{ name: 'mutual' }],
    };
    const r = await resolveCase({ file, envName: 't', env: undefined, caseIndex: 0, secrets });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('cyclic variable references');
  });
```

- [ ] **Step 2: Run to verify the three new tests fail**

Run: `npx vitest run tests/core/run-cases.test.ts tests/core/parse-salvo-file.test.ts tests/core/resolve-case.test.ts`
Expected: the M1 test fails (cases error with `undefined variables: baseUrl` instead of the environment message); the M3 test fails (message shows `a~1b`); the mutual-cycle test PASSES already (the re-review hand-traced it; the test pins it). A pre-passing pin is acceptable here — note it in the report.

- [ ] **Step 3: Implement M1** — in `src/core/runner/run-cases.ts`, after the `env` lookup add:

```ts
  const envMissing = manifest?.environments !== undefined && env === undefined;
```

and inside the `for` loop, right after the existing `if (!kase) continue;` guard:

```ts
    if (envMissing) {
      const available = Object.keys(manifest?.environments ?? {}).join(', ') || 'none';
      results.push({
        ...base,
        outcome: 'error',
        assertions: [],
        error: `Environment "${envName}" is not defined in salvo.yaml (available: ${available}).`,
      });
      continue;
    }
```

(Manifest absent → `envMissing` is false → existing behavior untouched; the existing tests prove it.)

- [ ] **Step 4: Implement M3** — in `src/core/format/parse-salvo-file.ts` add and use a decoder:

```ts
/** RFC 6901: '~1' -> '/', then '~0' -> '~'. */
function decodePointerSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}
```

In `nodePos`, decode each non-numeric segment: `.map((s) => (/^\d+$/.test(s) ? Number(s) : decodePointerSegment(s)))`.
In `formatAjvError`, render the decoded path: ``return `/${err.instancePath.split('/').filter(Boolean).map(decodePointerSegment).join('/')} ${err.message ?? 'is invalid'}`;`` — keeping the leading `/` and the `'/'` fallback for an empty path exactly as before (`err.instancePath ? ... : '/'`). Concretely:

```ts
function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath
    ? '/' + err.instancePath.split('/').filter(Boolean).map(decodePointerSegment).join('/')
    : '/';
  return `${path} ${err.message ?? 'is invalid'}`;
}
```

Apply the same `decodePointerSegment` + `formatAjvError` change to `src/core/format/parse-manifest.ts` (it renders instancePath in messages the same way; keep its `required`-params suffix behavior unchanged).

- [ ] **Step 5: Implement M2, M4, M5**

M2 — in `schemas/salvo-file.schema.json`, change the `request.variables` description to:
`"GraphQL variables. Top-level string values may contain {{var}} placeholders; strings nested inside objects or arrays pass through untouched."`
Then `npm run gen:types` (the generated comment updates).

M4 — in `examples/quickstart/countries.salvo`, replace the second case's expectation line `"data.continent": { exists: true }` with `"data.continent": null` (the literal-null matcher states the API contract precisely; the e2e fixture already returns null).

M5 — create `src/extension.ts`:
```ts
/** VS Code activation arrives in plan 3. This stub keeps the packaged entry point stable. */
export {};
```

- [ ] **Step 6: Run the full gate**

Run: `npm test && npm run check && npm run gen:check`
Expected: all green (the e2e test still passes with the M4 literal-null expectation).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: polish batch from plan-1 final review (env guard, pointer decode, docs)"
```

---

### Task 2: Schema loader (`load-schema`)

**Files:**
- Create: `src/core/schema/load-schema.ts`, `tests/core/fixtures/demo.graphql`
- Modify: `package.json` (add `graphql` dependency)
- Test: `tests/core/load-schema.test.ts`

**Interfaces:**
- Consumes: `SchemaSource` from `../generated/salvo-manifest`, `ParseIssue` from `../types`.
- Produces:
  ```ts
  export type HttpPost = (url: string, headers: Record<string, string>, body: unknown) => Promise<string>;
  export type LoadSchemaResult =
    | { ok: true; schema: import('graphql').GraphQLSchema }
    | { ok: false; issues: ParseIssue[] };
  export function loadSchema(args: {
    source: SchemaSource;
    readFile: (path: string) => Promise<string>;
    httpPost?: HttpPost;   // required only for schema.url
  }): Promise<LoadSchemaResult>;
  ```
  Plan 3 wires `readFile` to `vscode.workspace.fs` and `httpPost` over the fetch transport.

- [ ] **Step 1: Add the dependency and the fixture**

Run: `npm install graphql@^16.9.0 --no-audit --no-fund`

`tests/core/fixtures/demo.graphql`:
```graphql
type Query {
  me: User
  user(id: ID!): User
  items(first: Int): [Item!]!
}

type User {
  id: ID!
  name: String
  friends: [User!]
}

type Item {
  id: ID!
  label: String
}
```

- [ ] **Step 2: Write the failing tests**

`tests/core/load-schema.test.ts`:
```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/core/load-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`src/core/schema/load-schema.ts`:
```ts
import type { SchemaSource } from '../generated/salvo-manifest';
import type { ParseIssue } from '../types';
import type { GraphQLSchema } from 'graphql';

export type HttpPost = (url: string, headers: Record<string, string>, body: unknown) => Promise<string>;

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
```

- [ ] **Step 5: Run tests, typecheck, full suite**

Run: `npx vitest run tests/core/load-schema.test.ts && npm run check && npm test`
Expected: all green (the no-vscode guard now also scans `schema/`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/schema/ tests/core/fixtures/demo.graphql tests/core/load-schema.test.ts
git commit -m "feat: schema loader for SDL, introspection JSON, and opt-in url sources"
```

---

### Task 3: Operation source and position mapping (`operation-source`)

The bridge every language feature stands on: extract the GraphQL operation from a `.salvo` file and translate positions in BOTH directions. Non-empty literal block scalars (`operation: |`) get precise line-by-line mapping; folded (`>`), single-line, and empty blocks get a documented degenerate mapping anchored at the scalar (folding joins lines; an empty block has no content to map).

**Files:**
- Create: `src/core/lang/operation-source.ts`
- Test: `tests/core/operation-source.test.ts`

**Interfaces:**
- Consumes: raw `.salvo` text (parses internally with `yaml`; no dependency on parse-salvo-file).
- Produces:
  ```ts
  export interface OperationSource {
    text: string;  // exactly SalvoFile.request.operation
    /** 0-based op-relative position -> 1-based file line/col */
    toFilePosition(pos: { line: number; character: number }): { line: number; col: number };
    /** 1-based file line/col -> 0-based op-relative position; undefined when outside the operation body */
    fromFilePosition(pos: { line: number; col: number }): { line: number; character: number } | undefined;
  }
  export function locateOperation(fileText: string):
    | { ok: true; source: OperationSource }
    | { ok: false; reason: string };
  ```

- [ ] **Step 1: Write the failing tests**

`tests/core/operation-source.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { locateOperation } from '../../src/core/lang/operation-source';

// File layout (1-based lines):
// 1 salvo: 1
// 2 request:
// 3   url: "http://x.test/graphql"
// 4   operation: |
// 5     query Me {
// 6       me { id }
// 7     }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Me {
      me { id }
    }
`;

describe('locateOperation', () => {
  it('extracts the operation text verbatim', () => {
    const r = locateOperation(DOC);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source.text).toBe('query Me {\n  me { id }\n}\n');
  });

  it('maps op-relative positions to 1-based file positions', () => {
    const r = locateOperation(DOC);
    if (!r.ok) throw new Error(r.reason);
    // op line 0, char 0 = 'q' of query -> file 5:5 (indent 4)
    expect(r.source.toFilePosition({ line: 0, character: 0 })).toEqual({ line: 5, col: 5 });
    // op line 1, char 2 = 'm' of me -> file 6:7
    expect(r.source.toFilePosition({ line: 1, character: 2 })).toEqual({ line: 6, col: 7 });
  });

  it('maps file positions back and rejects positions outside the body', () => {
    const r = locateOperation(DOC);
    if (!r.ok) throw new Error(r.reason);
    expect(r.source.fromFilePosition({ line: 6, col: 7 })).toEqual({ line: 1, character: 2 });
    expect(r.source.fromFilePosition({ line: 3, col: 3 })).toBeUndefined();  // above the body
    expect(r.source.fromFilePosition({ line: 6, col: 2 })).toBeUndefined();  // left of the indent
    expect(r.source.fromFilePosition({ line: 99, col: 5 })).toBeUndefined(); // past the body
  });

  it('degrades gracefully for a single-line plain scalar operation', () => {
    const r = locateOperation('salvo: 1\nrequest:\n  url: x\n  operation: "query { ok }"\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.text).toBe('query { ok }');
      const anchor = r.source.toFilePosition({ line: 0, character: 5 });
      expect(anchor.line).toBe(4);                 // anchored at the scalar, not translated
      expect(r.source.fromFilePosition({ line: 4, col: 20 })).toBeUndefined();
    }
  });

  it('degrades folded scalars (>) to anchor-only mapping because folding joins lines', () => {
    const r = locateOperation('salvo: 1\nrequest:\n  url: x\n  operation: >\n    query {\n    ok }\n');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source.fromFilePosition({ line: 5, col: 5 })).toBeUndefined();
  });

  it('degrades an empty block operation instead of borrowing sibling indentation', () => {
    const r = locateOperation('salvo: 1\nrequest:\n  url: x\n  operation: |\n  timeout: 5000\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.text.trim()).toBe('');
      expect(r.source.fromFilePosition({ line: 5, col: 3 })).toBeUndefined();
    }
  });

  it('fails with a reason when the operation is missing or the YAML is broken', () => {
    const missing = locateOperation('salvo: 1\nrequest:\n  url: x\n');
    expect(missing.ok).toBe(false);
    const broken = locateOperation('request: [unclosed');
    expect(broken.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/operation-source.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/lang/operation-source.ts`:
```ts
import { parseDocument, LineCounter, isScalar, Scalar } from 'yaml';

export interface OperationSource {
  text: string;
  toFilePosition(pos: { line: number; character: number }): { line: number; col: number };
  fromFilePosition(pos: { line: number; col: number }): { line: number; character: number } | undefined;
}

export function locateOperation(fileText: string):
  | { ok: true; source: OperationSource }
  | { ok: false; reason: string } {
  const lc = new LineCounter();
  const doc = parseDocument(fileText, { lineCounter: lc, keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, reason: `YAML error: ${doc.errors[0]!.message}` };
  }
  const node = doc.getIn(['request', 'operation'], true);
  if (!isScalar(node) || typeof node.value !== 'string') {
    return { ok: false, reason: 'request.operation is missing or not a string.' };
  }
  const text = node.value;

  if (node.type !== Scalar.BLOCK_LITERAL || text.trim().length === 0) {
    // Only a non-empty literal block ('|') preserves line structure. Folded
    // blocks ('>') join lines, and single-line styles unescape - both lose the
    // correspondence - while an empty block would borrow indentation from
    // whatever sibling line follows it. Anchor those at the scalar and refuse
    // inverse mapping.
    // (yaml populates range for every node parsed without errors; the
    // doc.errors guard above makes the assertion safe.)
    const at = lc.linePos(node.range![0]);
    const anchor = { line: at.line, col: at.col };
    return {
      ok: true,
      source: { text, toFilePosition: () => anchor, fromFilePosition: () => undefined },
    };
  }

  // Block scalar: range[0] sits on the '|' header line; content starts on the
  // next line with a constant indent, so lines map one-to-one.
  const headerLine = lc.linePos(node.range![0]).line;   // 1-based
  const contentStartLine = headerLine + 1;               // file line of op line 0
  const fileLines = fileText.split('\n');
  // Relies on YAML auto-detected indentation: the first non-blank content line
  // sets the block's floor, so scanning to it cannot overshoot the block.
  let indent = 0;
  for (let l = contentStartLine - 1; l < fileLines.length; l += 1) {
    const lineText = fileLines[l]!;
    if (lineText.trim().length > 0) {
      indent = lineText.length - lineText.trimStart().length;
      break;
    }
  }
  // A clip-chomped block ('|') ends with '\n'; the split's trailing '' is not a
  // real operation line and must not make the next YAML line map as one.
  const opLineCount = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

  return {
    ok: true,
    source: {
      text,
      toFilePosition: ({ line, character }) => ({ line: contentStartLine + line, col: indent + character + 1 }),
      fromFilePosition: ({ line, col }) => {
        const opLine = line - contentStartLine;
        const character = col - indent - 1;
        if (opLine < 0 || opLine >= opLineCount || character < 0) return undefined;
        return { line: opLine, character };
      },
    },
  };
}
```

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run tests/core/operation-source.test.ts && npm run check`
Expected: PASS. If the first mapping test is off by one, re-derive from the DOC comment layout in the test file before touching the formula; the test's expected values were hand-computed from that layout.

- [ ] **Step 5: Commit**

```bash
git add src/core/lang/operation-source.ts tests/core/operation-source.test.ts
git commit -m "feat: operation extraction with bidirectional position mapping"
```

---

### Task 4: Language functions with file positions (`graphql-language`)

**Files:**
- Create: `src/core/lang/graphql-language.ts`
- Modify: `package.json` (add `graphql-language-service`)
- Test: `tests/core/graphql-language.test.ts`

**Interfaces:**
- Consumes: `OperationSource` (Task 3), a `GraphQLSchema` (Task 2), `ParseIssue`.
- Produces:
  ```ts
  export function getOperationDiagnostics(schema: GraphQLSchema, op: OperationSource): ParseIssue[];
  export function getCompletionsAt(schema: GraphQLSchema, op: OperationSource, filePos: { line: number; col: number }): CompletionItem[];
  export function getHoverAt(schema: GraphQLSchema, op: OperationSource, filePos: { line: number; col: number }): string | undefined;
  export function getVariablesJsonSchemaFor(schema: GraphQLSchema, operationText: string): Record<string, unknown> | undefined;
  ```
  (`CompletionItem` re-exported from graphql-language-service.) Plan 3's webview/editor consumes these verbatim.

- [ ] **Step 1: Add the dependency**

Run: `npm install graphql-language-service@^5.5.2 --no-audit --no-fund`

- [ ] **Step 2: Write the failing tests**

`tests/core/graphql-language.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema } from 'graphql';
import { locateOperation } from '../../src/core/lang/operation-source';
import {
  getCompletionsAt,
  getHoverAt,
  getOperationDiagnostics,
  getVariablesJsonSchemaFor,
} from '../../src/core/lang/graphql-language';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('./fixtures/demo.graphql', import.meta.url)), 'utf8'));

// 1 salvo: 1
// 2 request:
// 3   url: "http://x.test/graphql"
// 4   operation: |
// 5     query Bad {
// 6       me { nope }
// 7     }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Bad {
      me { nope }
    }
`;

const op = (() => {
  const r = locateOperation(DOC);
  if (!r.ok) throw new Error(r.reason);
  return r.source;
})();

describe('graphql-language', () => {
  it('maps diagnostics onto FILE positions', () => {
    const issues = getOperationDiagnostics(schema, op);
    expect(issues.length).toBeGreaterThan(0);
    const bad = issues[0]!;
    expect(bad.message).toContain('nope');
    expect(bad.severity).toBe('error');
    expect(bad.line).toBe(6);   // 'nope' is on file line 6
    expect(bad.col).toBe(12);   // indent 4 + op char 7 + 1
  });

  it('returns zero diagnostics for a valid operation', () => {
    const ok = locateOperation(DOC.replace('nope', 'id'));
    if (!ok.ok) throw new Error(ok.reason);
    expect(getOperationDiagnostics(schema, ok.source)).toEqual([]);
  });

  it('completes fields at a file position inside the selection set', () => {
    const items = getCompletionsAt(schema, op, { line: 6, col: 12 });
    const labels = items.map((i) => i.label);
    expect(labels).toContain('id');
    expect(labels).toContain('friends');
  });

  it('returns no completions for a position outside the operation body', () => {
    expect(getCompletionsAt(schema, op, { line: 3, col: 4 })).toEqual([]);
  });

  it('hovers the me field with its type', () => {
    const hover = getHoverAt(schema, op, { line: 6, col: 8 });
    expect(hover).toContain('User');
  });

  it('builds a variables JSON Schema from operation variable types', () => {
    const text = 'query Q($id: ID!, $first: Int) { user(id: $id) { id } }';
    const js = getVariablesJsonSchemaFor(schema, text) as { properties?: Record<string, unknown>; required?: string[] };
    expect(js.properties?.['id']).toBeDefined();
    expect(js.required).toContain('id');
  });

  it('returns undefined variables schema for an unparsable operation', () => {
    expect(getVariablesJsonSchemaFor(schema, 'query {{{')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/core/graphql-language.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`src/core/lang/graphql-language.ts`:
```ts
import type { GraphQLSchema } from 'graphql';
import {
  getAutocompleteSuggestions,
  getDiagnostics,
  getHoverInformation,
  getOperationFacts,
  getVariablesJSONSchema,
  Position,
  type CompletionItem,
} from 'graphql-language-service';
import type { ParseIssue } from '../types';
import type { OperationSource } from './operation-source';

export type { CompletionItem };

export function getOperationDiagnostics(schema: GraphQLSchema, op: OperationSource): ParseIssue[] {
  return getDiagnostics(op.text, schema).map((d) => {
    const { line, col } = op.toFilePosition({ line: d.range.start.line, character: d.range.start.character });
    return {
      message: d.message.split('\n')[0] ?? d.message,
      line,
      col,
      severity: d.severity === 2 ? ('warning' as const) : ('error' as const),
    };
  });
}

export function getCompletionsAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): CompletionItem[] {
  const pos = op.fromFilePosition(filePos);
  if (!pos) return [];
  return getAutocompleteSuggestions(schema, op.text, new Position(pos.line, pos.character));
}

export function getHoverAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): string | undefined {
  const pos = op.fromFilePosition(filePos);
  if (!pos) return undefined;
  const contents = getHoverInformation(schema, op.text, new Position(pos.line, pos.character));
  return typeof contents === 'string' && contents.length > 0 ? contents : undefined;
}

export function getVariablesJsonSchemaFor(
  schema: GraphQLSchema,
  operationText: string
): Record<string, unknown> | undefined {
  const facts = getOperationFacts(schema, operationText);
  if (!facts?.variableToType) return undefined;
  return getVariablesJSONSchema(facts.variableToType) as Record<string, unknown>;
}
```

- [ ] **Step 5: Run tests, typecheck, full suite**

Run: `npx vitest run tests/core/graphql-language.test.ts && npm run check && npm test`
Expected: all green. If the diagnostic position assertions fail, print the actual `d.range.start` in a scratch run and compare against the mapping BEFORE changing either the test or the formula — the spike measured `getDiagnostics` pointing at the field name start; a legitimate upstream difference is a report-and-stop, not a silent test edit.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/lang/graphql-language.ts tests/core/graphql-language.test.ts
git commit -m "feat: diagnostics, completions, hover, and variables schema with file positions"
```

---

### Task 5: Integration proof

The plan-2 exit gate: one test that walks the REAL pipeline a user will hit in plan 3 — parse a `.salvo` file, load the schema through `loadSchema`, surface diagnostics at file positions, complete at a cursor, and derive the variables JSON Schema, all against the shipped fixture schema.

**Files:**
- Test: `tests/core/graphql-integration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–4 plus plan 1's `parseSalvoFile`.
- Produces: nothing new; this is the gate.

- [ ] **Step 1: Write the test**

`tests/core/graphql-integration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';
import { loadSchema } from '../../src/core/schema/load-schema';
import { locateOperation } from '../../src/core/lang/operation-source';
import { getCompletionsAt, getOperationDiagnostics, getVariablesJsonSchemaFor } from '../../src/core/lang/graphql-language';

const FIXTURE = fileURLToPath(new URL('./fixtures/demo.graphql', import.meta.url));

// 1 salvo: 1
// 2 request:
// 3   url: "{{baseUrl}}/graphql"
// 4   operation: |
// 5     query U($id: ID!) {
// 6       user(id: $id) {
// 7         id
// 8         wrong
// 9       }
// 10    }
const DOC = `salvo: 1
request:
  url: "{{baseUrl}}/graphql"
  operation: |
    query U($id: ID!) {
      user(id: $id) {
        id
        wrong
      }
    }
cases:
  - name: found
    vars: { id: u1 }
    expect: { status: 200 }
`;

describe('graphql layer end to end', () => {
  it('parses, loads the schema from disk, and produces file-positioned language results', async () => {
    const parsed = parseSalvoFile(DOC);
    expect(parsed.ok).toBe(true);

    const loaded = await loadSchema({
      source: { sdl: FIXTURE },
      readFile: async (p) => readFileSync(p, 'utf8'),
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const located = locateOperation(DOC);
    expect(located.ok).toBe(true);
    if (!located.ok) return;

    const issues = getOperationDiagnostics(loaded.schema, located.source);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('wrong');
    expect(issues[0]?.line).toBe(8);
    expect(issues[0]?.col).toBe(9); // indent 4 + op char 4 + 1 ('wrong' sits two levels deep)

    const labels = getCompletionsAt(loaded.schema, located.source, { line: 8, col: 9 }).map((i) => i.label);
    expect(labels).toContain('name');

    const vars = getVariablesJsonSchemaFor(loaded.schema, located.source.text) as { required?: string[] };
    expect(vars.required).toContain('id');
  });
});
```

- [ ] **Step 2: Run it, then the full gate**

Run: `npx vitest run tests/core/graphql-integration.test.ts`
Expected: PASS.
Then: `npm test && npm run check && npm run gen:check && (grep -ri "linkareer" src tests examples schemas; test $? -eq 1)`
Expected: all green, grep finds nothing.

- [ ] **Step 3: Commit**

```bash
git add tests/core/graphql-integration.test.ts
git commit -m "test: end-to-end proof of the graphql layer over file positions"
```

---

## Exit Criteria for Plan 2

- All plan-1 gates still green plus the new suites; `grep -ri "linkareer"` still empty.
- The lang layer's public surface uses FILE positions only (no 0-based op positions escape).
- `loadSchema` failure paths all return issues (nothing throws), including the two shapes real SDL corpora exhibited (syntax break, unknown-type reference: the fixture-mutation tests cover the syntax class; unknown-type surfaces through the same GraphQLError path).
- Polish batch from plan 1's final review is closed (M1–M5 + mutual-cycle pin).

## What Plan 3 Will Consume

- `loadSchema` with `readFile` over `vscode.workspace.fs` and `httpPost` over the fetch transport; schema memoization + file watching live in plan 3, keyed by the manifest's schema source (one-adapter rule: no cache layer in core until a second consumer exists).
- `locateOperation` + `getOperationDiagnostics`/`getCompletionsAt`/`getHoverAt` for the custom editor; `getVariablesJsonSchemaFor` to validate case `vars` blocks.
- The lang module is dynamic-imported by the extension so `graphql`'s cold load never rides activation.
