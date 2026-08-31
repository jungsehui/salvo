# Salvo v0.1 Extension Foundation Implementation Plan (plan 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the core into a working VS Code extension WITHOUT the custom-editor GUI yet: `.salvo` files get GraphQL diagnostics, completions, and hover in the plain text editor; cases run from the command palette against the active environment with secrets from `SecretStorage`; the whole thing bundles with esbuild and packages with vsce. The webview GUI is plan 3b.

**Architecture:** Everything with logic lives in `src/host/` as vscode-FREE modules (injected `SecretStore`/`FileSystemLike` interfaces), unit-tested under vitest exactly like the core. `src/extension.ts` is the only file that imports `vscode`: it adapts VS Code APIs onto those interfaces and converts our `ParseIssue`/`CompletionItem` shapes into `vscode.*` types. `.salvo` is contributed as an extra extension of the EXISTING `yaml` language id — that gives YAML highlighting for free and lets `redhat.vscode-yaml` (which activates on `onLanguage:yaml`) pick up our `yamlValidation` schema contributions, resolving architecture decision 3's open question in favor of the yaml-id path.

**Tech Stack:** adds devDeps `@types/vscode` ^1.110.0, `esbuild` ^0.25.0, `@vscode/vsce` ^3.6.0. Runtime deps unchanged. esbuild bundles with `platform: 'node'` whose main-first resolution keeps ONE `graphql` realm (the carried note from plan 2 — verified by a bundle-time guard in Task 1).

**Spec:** `.claude/architecture.md` (decisions 1, 3, 5, 8, 10) and `.claude/roadmap.md`. Consumes plan 1+2 interfaces as shipped: `runCases`, `createFetchTransport`, `loadSchema`, `collect`-style lang functions, `parseManifest`, `SecretResolver`.

**Plan set:** plan 3a of the v0.1 set. Plan 3b (CustomTextEditorProvider + React webview + document sync per decisions 2 and 9) builds on the services this plan lands.

## Global Constraints

- **`engines.vscode: "^1.110.0"`** — the floor where `SecretStorage.keys()` exists (verified: present in @types/vscode 1.110, absent in 1.109). Never use an API newer than 1.110 without raising the floor explicitly.
- **Only `src/extension.ts` may reference the `vscode` module.** `src/host/**` joins `src/core/**` under the purity guard (Task 1 extends the guard test). `import type * as vscode from 'vscode'` in extension.ts is fine; host modules may not even do that.
- **Secret keys**: `salvo/v1/${enc(projectId)}/${enc(envName)}/${enc(name)}` with `encodeURIComponent` parts (architecture decision 5; encoding keeps '/'-bearing env names from corrupting the namespace). Values never leave SecretStorage; never logged.
- **English-only user-facing strings** (commands, messages, report lines). No telemetry, no network beyond the injected transport (CLAUDE.md hard rules).
- **Schema-load failures surface once per project as a warning message naming the source — never as squiggles inside the `.salvo` file** (the coordinate-space rule from plan 2's final review: those issues belong to the schema source file).
- **Generic by design**: no company values; fixtures synthetic; quickstart example remains the demo path.
- Node 20+, TS strict clean, kebab-case, `npm test && npm run check && npm run gen:check` green at every commit; `npm run build` green from Task 1 on.

## File Structure

```
esbuild.mjs                       # bundle script (host bundle only in 3a)
.vscodeignore
src/
├─ extension.ts                   # ONLY vscode importer: adapters + registrations
├─ host/                          # vscode-free, vitest-tested
│  ├─ secrets.ts                  # key composition, SecretResolver adapter, listing
│  ├─ manifest-locator.ts         # walk-up salvo.yaml discovery + env defaulting
│  ├─ salvo-language.ts           # text+schema -> diagnostics/completions/hover glue
│  └─ run-controller.ts           # parse -> runCases -> human-readable report
tests/core/…                      # existing
tests/host/                       # new unit tests, one per host module
```

---

### Task 1: Bundling, manifest contributions, and the widened purity guard

**Files:**
- Create: `esbuild.mjs`, `.vscodeignore`
- Modify: `package.json` (extension fields + scripts + devDeps), `src/extension.ts` (activate/deactivate stubs), `tests/core/no-vscode-import.test.ts` (widen to src/host)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` → `dist/extension.js` (cjs, node20, vscode external); manifest contributions later tasks rely on (`salvo.runCases`, `salvo.selectEnvironment`, `salvo.setSecret`, `salvo.refreshSchema` command ids; yaml language extension `.salvo`).

- [ ] **Step 1: Extend package.json**

Merge these fields into the existing `package.json` (keep everything already there; `engines.node` stays):

```json
{
  "publisher": "jungsehui",
  "main": "./dist/extension.js",
  "engines": { "node": ">=20", "vscode": "^1.110.0" },
  "categories": ["Programming Languages", "Testing"],
  "activationEvents": [
    "workspaceContains:**/*.salvo",
    "workspaceContains:**/salvo.yaml"
  ],
  "contributes": {
    "languages": [{ "id": "yaml", "extensions": [".salvo"] }],
    "yamlValidation": [
      { "fileMatch": "*.salvo", "url": "./schemas/salvo-file.schema.json" },
      { "fileMatch": "salvo.yaml", "url": "./schemas/salvo-manifest.schema.json" }
    ],
    "commands": [
      { "command": "salvo.runCases", "title": "Salvo: Run Cases in Current File" },
      { "command": "salvo.selectEnvironment", "title": "Salvo: Select Environment" },
      { "command": "salvo.setSecret", "title": "Salvo: Set Secret" },
      { "command": "salvo.refreshSchema", "title": "Salvo: Refresh Schema" }
    ]
  }
}
```

Add scripts: `"build": "node esbuild.mjs"`. Add devDeps via:
Run: `npm install -D esbuild@^0.25.0 @vscode/vsce@^3.6.0 --no-audit --no-fund && npm install -D --save-exact @types/vscode@1.110.0 --no-audit --no-fund`
(`@types/vscode` pinned exact via `--save-exact` — npm's default save-prefix would silently add a caret, and its major.minor IS the API floor. Verify `package.json` shows `"@types/vscode": "1.110.0"` with no `^`.)

- [ ] **Step 2: Write esbuild.mjs**

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  // platform 'node' resolves packages main-first, which keeps a single
  // `graphql` module realm in the bundle (the dual-realm hazard plan 2 hit
  // under vitest cannot recur here as long as this stays 'node').
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});
```

- [ ] **Step 3: Write .vscodeignore**

```
.worktrees/**
.superpowers/**
.claude/**
.github/**
docs/**
src/**
tests/**
node_modules/**
out/**
esbuild.mjs
vitest.config.ts
tsconfig.json
.nvmrc
*.vsix
package-lock.json
CLAUDE.md
.idea/**
.planning/**
.omc/**
.claude/local/**
```

- [ ] **Step 4: Replace src/extension.ts stub with activation stubs**

```ts
import type * as vscode from 'vscode';

/** Wiring for language features, environments, secrets, and runs arrives in later tasks. */
export function activate(_context: vscode.ExtensionContext): void {}

export function deactivate(): void {}
```

- [ ] **Step 5: Widen the purity guard**

In `tests/core/no-vscode-import.test.ts`, change the constant and the test name so BOTH trees are scanned:

```ts
const GUARDED_DIRS = ['../../src/core', '../../src/host'].map((p) => fileURLToPath(new URL(p, import.meta.url)));
```

and make the check PER DIRECTORY, so one populated dir can never mask another going missing:

```ts
  it('src/core and src/host never reference the vscode module', () => {
    const dirs = GUARDED_DIRS.filter((d) => existsSync(d));
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      const files = walk(dir);
      expect(files.length, `${dir} has no files to scan`).toBeGreaterThan(0);
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        // Any 'vscode' module string: static/side-effect/dynamic import and require alike.
        expect(src, `${f} references the vscode module`).not.toMatch(/['"]vscode['"]/);
      }
    }
  });
```
(add `existsSync` to the `node:fs` import; `src/host` does not exist until Task 2 — `existsSync` keeps the guard honest today and automatic tomorrow.)

- [ ] **Step 6: Verify**

Run: `npm run build && node -e "const m=require('./dist/extension.js'); if (typeof m.activate!=='function'||typeof m.deactivate!=='function') process.exit(1); console.log('activate/deactivate exported')"`
Expected: bundle emitted; both exports present (the type-only vscode import is erased, so requiring the bundle outside VS Code works).
Then: `npm test && npm run check && npm run gen:check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json esbuild.mjs .vscodeignore src/extension.ts tests/core/no-vscode-import.test.ts
git commit -m "feat: extension manifest, esbuild bundling, and widened purity guard"
```

---

### Task 2: Secrets (`src/host/secrets.ts`)

**Files:**
- Create: `src/host/secrets.ts`
- Test: `tests/host/secrets.test.ts`

**Interfaces:**
- Consumes: `SecretResolver` from `../core/types`.
- Produces:
  ```ts
  export interface SecretStore {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
    keys(): PromiseLike<string[]>;
  }
  export function makeSecretKey(projectId: string, envName: string, name: string): string;
  export function createSecretResolver(store: SecretStore, projectId: string, envName: string): SecretResolver;
  export function listSecretNames(store: SecretStore, projectId: string, envName: string): Promise<string[]>;
  ```
  `vscode.SecretStorage` satisfies `SecretStore` structurally; extension.ts passes it straight through. `listSecretNames` has no consumer until plan 3b's secret-management UI — it lives here because the decode side of the key encoding belongs beside the encoder, and its tests pin the roundtrip.

- [ ] **Step 1: Write the failing tests**

`tests/host/secrets.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/host/secrets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/host/secrets.ts`:
```ts
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
```

- [ ] **Step 4: Run tests, typecheck, full suite**

Run: `npx vitest run tests/host/secrets.test.ts && npm run check && npm test`
Expected: all green — including the widened purity guard now scanning `src/host`.

- [ ] **Step 5: Commit**

```bash
git add src/host/secrets.ts tests/host/secrets.test.ts
git commit -m "feat: namespaced secret storage adapter with scoped listing"
```

---

### Task 3: Manifest discovery and environment defaulting (`src/host/manifest-locator.ts`)

**Files:**
- Create: `src/host/manifest-locator.ts`
- Test: `tests/host/manifest-locator.test.ts`

**Interfaces:**
- Consumes: `parseManifest` (core), `SalvoManifest` (generated), `ParseIssue`.
- Produces:
  ```ts
  export interface FileSystemLike {
    /** File text, or undefined when the file does not exist. Never throws. */
    readFile(path: string): Promise<string | undefined>;
  }
  export interface LocatedManifest { dir: string; path: string; manifest: SalvoManifest }
  export function locateManifest(fs: FileSystemLike, fileDir: string, stopDir: string):
    Promise<{ ok: true; found?: LocatedManifest } | { ok: false; issues: ParseIssue[] }>;
  export function pickEnvironment(manifest: SalvoManifest | undefined, saved: string | undefined): string | undefined;
  ```
  Paths use '/' separators; extension.ts normalizes (`vscode.Uri.path` is already '/'-separated on every platform).

- [ ] **Step 1: Write the failing tests**

`tests/host/manifest-locator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { locateManifest, pickEnvironment, type FileSystemLike } from '../../src/host/manifest-locator';

const MANIFEST = 'salvo: 1\nid: proj-12345678\nenvironments:\n  dev: { vars: { baseUrl: "http://d" } }\n  prod: { vars: { baseUrl: "http://p" } }\n';
const fsOf = (map: Record<string, string>): FileSystemLike => ({ readFile: async (p) => map[p] });

describe('locateManifest', () => {
  it('finds the nearest salvo.yaml walking up to stopDir', async () => {
    const fs = fsOf({ '/w/api/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/w/api/requests/auth', '/w');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.found?.dir).toBe('/w/api');
      expect(r.found?.manifest.id).toBe('proj-12345678');
    }
  });

  it('prefers the closest manifest over an ancestor one', async () => {
    const fs = fsOf({ '/w/salvo.yaml': MANIFEST, '/w/api/salvo.yaml': MANIFEST.replace('proj-12345678', 'proj-inner-99') });
    const r = await locateManifest(fs, '/w/api', '/w');
    expect(r.ok && r.found?.manifest.id).toBe('proj-inner-99');
  });

  it('returns found: undefined when nothing exists up to stopDir', async () => {
    const r = await locateManifest(fsOf({}), '/w/api', '/w');
    expect(r).toEqual({ ok: true, found: undefined });
  });

  it('does not walk above stopDir', async () => {
    const fs = fsOf({ '/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/w/api', '/w');
    expect(r).toEqual({ ok: true, found: undefined });
  });

  it('finds a manifest at the filesystem root without a double slash', async () => {
    const fs = fsOf({ '/salvo.yaml': MANIFEST });
    const r = await locateManifest(fs, '/', '/');
    expect(r.ok && r.found?.path).toBe('/salvo.yaml');
  });

  it('surfaces a broken manifest as issues with the path in the message', async () => {
    const fs = fsOf({ '/w/salvo.yaml': 'salvo: 1\n' });
    const r = await locateManifest(fs, '/w', '/w');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toContain('/w/salvo.yaml');
  });
});

describe('pickEnvironment', () => {
  const manifest = { salvo: 1 as const, id: 'proj-12345678', environments: { dev: {}, prod: {} } };
  it('keeps a saved name when it still exists', () => {
    expect(pickEnvironment(manifest, 'prod')).toBe('prod');
  });
  it('falls back to the first defined environment', () => {
    expect(pickEnvironment(manifest, 'gone')).toBe('dev');
    expect(pickEnvironment(manifest, undefined)).toBe('dev');
  });
  it('ignores prototype-chain names as saved environments', () => {
    expect(pickEnvironment(manifest, 'constructor')).toBe('dev');
  });
  it('returns undefined without a manifest or environments', () => {
    expect(pickEnvironment(undefined, 'dev')).toBeUndefined();
    expect(pickEnvironment({ salvo: 1, id: 'proj-12345678' }, 'dev')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/host/manifest-locator.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/host/manifest-locator.ts`:
```ts
import { parseManifest } from '../core/format/parse-manifest';
import type { SalvoManifest } from '../core/generated/salvo-manifest';
import type { ParseIssue } from '../core/types';

export interface FileSystemLike {
  /** File text, or undefined when the file does not exist. Never throws. */
  readFile(path: string): Promise<string | undefined>;
}

export interface LocatedManifest {
  dir: string;
  path: string;
  manifest: SalvoManifest;
}

const trimSlash = (p: string): string => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

export async function locateManifest(
  fs: FileSystemLike,
  fileDir: string,
  stopDir: string
): Promise<{ ok: true; found?: LocatedManifest } | { ok: false; issues: ParseIssue[] }> {
  const stop = trimSlash(stopDir);
  let dir = trimSlash(fileDir);
  for (;;) {
    const path = dir === '/' ? '/salvo.yaml' : `${dir}/salvo.yaml`;
    const text = await fs.readFile(path);
    if (text !== undefined) {
      const parsed = parseManifest(text);
      if (!parsed.ok) {
        return { ok: false, issues: parsed.issues.map((i) => ({ ...i, message: `${path}: ${i.message}` })) };
      }
      return { ok: true, found: { dir, path, manifest: parsed.manifest } };
    }
    if (dir === stop) return { ok: true, found: undefined };
    const parent = dir.slice(0, dir.lastIndexOf('/')) || '/';
    if (parent === dir) return { ok: true, found: undefined };
    dir = parent;
  }
}

export function pickEnvironment(manifest: SalvoManifest | undefined, saved: string | undefined): string | undefined {
  const envs = manifest?.environments;
  if (!envs) return undefined;
  const names = Object.keys(envs);
  if (names.length === 0) return undefined;
  // Object.hasOwn: 'constructor' etc. must not count as a defined environment.
  return saved !== undefined && Object.hasOwn(envs, saved) ? saved : names[0];
}
```

- [ ] **Step 4: Run tests, typecheck, full suite**

Run: `npx vitest run tests/host/manifest-locator.test.ts && npm run check && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/host/manifest-locator.ts tests/host/manifest-locator.test.ts
git commit -m "feat: walk-up manifest discovery and environment defaulting"
```

---

### Task 4: Language glue (`src/host/salvo-language.ts`)

**Files:**
- Create: `src/host/salvo-language.ts`
- Test: `tests/host/salvo-language.test.ts`

**Interfaces:**
- Consumes: `parseSalvoFile`, `locateOperation`, `getOperationDiagnostics`/`getCompletionsAt`/`getHoverAt`, `ParseIssue`, `CompletionItem`, `GraphQLSchema` (type).
- Produces:
  ```ts
  export function collectDiagnostics(text: string, schema: GraphQLSchema | undefined): ParseIssue[];
  export function completionsInFile(text: string, schema: GraphQLSchema | undefined, pos: { line: number; col: number }): CompletionItem[];
  export function hoverInFile(text: string, schema: GraphQLSchema | undefined, pos: { line: number; col: number }): string | undefined;
  ```
  All positions 1-based file coordinates (the plan-2 contract); extension.ts does the ±1 conversion to VS Code's 0-based positions.

- [ ] **Step 1: Write the failing tests**

`tests/host/salvo-language.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema } from 'graphql';
import { collectDiagnostics, completionsInFile, hoverInFile } from '../../src/host/salvo-language';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../core/fixtures/demo.graphql', import.meta.url)), 'utf8'));

// 1 salvo: 1 / 2 request: / 3 url / 4 operation: | / 5 query / 6 me { nope } / 7 }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Bad {
      me { nope }
    }
`;

describe('salvo-language glue', () => {
  it('combines parse warnings and operation diagnostics', () => {
    const issues = collectDiagnostics(DOC, schema);
    expect(issues.some((i) => i.message.includes('nope') && i.line === 6)).toBe(true);
  });

  it('returns parse issues alone when there is no schema', () => {
    const issues = collectDiagnostics(DOC, undefined);
    expect(issues.every((i) => !i.message.includes('nope'))).toBe(true);
  });

  it('returns YAML/schema errors for a broken file without touching the language layer', () => {
    const issues = collectDiagnostics('salvo: 1\nrequest: [unclosed', schema);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe('error');
  });

  it('completes and hovers at file positions, and stays quiet without a schema', () => {
    expect(completionsInFile(DOC, schema, { line: 6, col: 12 }).map((i) => i.label)).toContain('id');
    expect(hoverInFile(DOC, schema, { line: 6, col: 8 })).toContain('User');
    expect(completionsInFile(DOC, undefined, { line: 6, col: 12 })).toEqual([]);
    expect(hoverInFile(DOC, undefined, { line: 6, col: 8 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/host/salvo-language.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/host/salvo-language.ts`:
```ts
import type { GraphQLSchema } from 'graphql';
import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { locateOperation } from '../core/lang/operation-source';
import {
  getCompletionsAt,
  getHoverAt,
  getOperationDiagnostics,
  type CompletionItem,
} from '../core/lang/graphql-language';
import type { ParseIssue } from '../core/types';

export type { CompletionItem };

export function collectDiagnostics(text: string, schema: GraphQLSchema | undefined): ParseIssue[] {
  const parsed = parseSalvoFile(text);
  if (!parsed.ok) return parsed.issues;
  const issues = [...parsed.issues];
  if (schema) {
    const located = locateOperation(text);
    if (located.ok) issues.push(...getOperationDiagnostics(schema, located.source));
  }
  return issues;
}

export function completionsInFile(
  text: string,
  schema: GraphQLSchema | undefined,
  pos: { line: number; col: number }
): CompletionItem[] {
  if (!schema) return [];
  const located = locateOperation(text);
  if (!located.ok) return [];
  return getCompletionsAt(schema, located.source, pos);
}

export function hoverInFile(
  text: string,
  schema: GraphQLSchema | undefined,
  pos: { line: number; col: number }
): string | undefined {
  if (!schema) return undefined;
  const located = locateOperation(text);
  if (!located.ok) return undefined;
  return getHoverAt(schema, located.source, pos);
}
```

- [ ] **Step 4: Run tests, typecheck, full suite**

Run: `npx vitest run tests/host/salvo-language.test.ts && npm run check && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/host/salvo-language.ts tests/host/salvo-language.test.ts
git commit -m "feat: language glue combining parse and operation intelligence"
```

---

### Task 5: Run controller (`src/host/run-controller.ts`)

**Files:**
- Create: `src/host/run-controller.ts`
- Test: `tests/host/run-controller.test.ts`

**Interfaces:**
- Consumes: `parseSalvoFile`, `runCases`, `RunResult`, `SecretResolver`, `Transport`, `SalvoManifest`.
- Produces:
  ```ts
  export function runSalvoFile(args: {
    fileText: string;
    manifest: SalvoManifest | undefined;
    envName: string;
    deps: { secrets: SecretResolver; send: Transport };
  }): Promise<{ ok: false; issues: ParseIssue[] } | { ok: true; results: RunResult[]; report: string }>;
  export function formatRunReport(results: RunResult[], envName: string): string;
  ```
  The report is the OutputChannel payload (plan 3b's webview will consume `results` directly).

- [ ] **Step 1: Write the failing tests**

`tests/host/run-controller.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatRunReport, runSalvoFile } from '../../src/host/run-controller';
import type { HttpResponse, Transport } from '../../src/core/types';

const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  headers: { auth: "{{token}}" }
  operation: |
    query { ok }
cases:
  - name: ok
    vars: { token: good }
    expect: { status: 200, json: { "data.ok": true } }
  - name: denied
    vars: { token: bad }
    expect: { status: 200, json: { "errors[0].extensions.code": "UNAUTHENTICATED" } }
  - name: boom
    vars: { token: boom }
`;

const send: Transport = async (req): Promise<HttpResponse> => {
  const token = req.headers['auth'];
  if (token === 'boom') throw new Error('socket hang up');
  const json = token === 'good' ? { data: { ok: true } } : { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }], data: null };
  return { status: 200, headers: {}, bodyText: JSON.stringify(json), json, durationMs: 7 };
};

describe('runSalvoFile', () => {
  it('runs all cases and formats a deterministic report', async () => {
    const r = await runSalvoFile({ fileText: DOC, manifest: undefined, envName: 'default', deps: { secrets: async () => undefined, send } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.map((x) => x.outcome)).toEqual(['passed', 'passed', 'error']);
    expect(r.report).toContain('Salvo run · environment "default" · 3 cases');
    expect(r.report).toContain('PASS  ok (200, 7ms)');
    expect(r.report).toContain('ERROR boom — socket hang up');
    expect(r.report).toContain('2 passed, 0 failed, 0 skipped, 1 error');
  });

  it('reports parse failures as issues instead of running', async () => {
    const r = await runSalvoFile({ fileText: 'salvo: 1\nrequest: [unclosed', manifest: undefined, envName: 'x', deps: { secrets: async () => undefined, send } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.severity).toBe('error');
  });
});

describe('formatRunReport', () => {
  it('shows the first failing assertion for failed cases', () => {
    const report = formatRunReport(
      [{
        caseIndex: 0, caseName: 'wrong', outcome: 'failed',
        assertions: [
          { target: 'json data.ok', expected: 'equals true', actual: 'false', pass: false },
          { target: 'status', expected: '200', actual: '200', pass: true },
        ],
        response: { status: 200, headers: {}, bodyText: '', json: {}, durationMs: 3 },
      }],
      'dev'
    );
    expect(report).toContain('FAIL  wrong — json data.ok: expected equals true, actual false');
    expect(report).toContain('0 passed, 1 failed, 0 skipped, 0 errors');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/host/run-controller.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/host/run-controller.ts`:
```ts
import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { runCases } from '../core/runner/run-cases';
import type { SalvoManifest } from '../core/generated/salvo-manifest';
import type { ParseIssue, RunResult, SecretResolver, Transport } from '../core/types';

export async function runSalvoFile(args: {
  fileText: string;
  manifest: SalvoManifest | undefined;
  envName: string;
  deps: { secrets: SecretResolver; send: Transport };
}): Promise<{ ok: false; issues: ParseIssue[] } | { ok: true; results: RunResult[]; report: string }> {
  const parsed = parseSalvoFile(args.fileText);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  const results = await runCases({
    file: parsed.file,
    envName: args.envName,
    manifest: args.manifest,
    selected: 'all',
    deps: args.deps,
  });
  return { ok: true, results, report: formatRunReport(results, args.envName) };
}

export function formatRunReport(results: RunResult[], envName: string): string {
  const lines: string[] = [`Salvo run · environment "${envName}" · ${results.length} cases`];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.outcome === 'passed') {
      passed += 1;
      lines.push(`  PASS  ${r.caseName} (${r.response?.status ?? '?'}, ${r.response?.durationMs ?? '?'}ms)`);
    } else if (r.outcome === 'failed') {
      failed += 1;
      const first = r.assertions.find((a) => !a.pass);
      lines.push(`  FAIL  ${r.caseName} — ${first ? `${first.target}: expected ${first.expected}, actual ${first.actual}` : 'assertion failed'}`);
    } else if (r.outcome === 'skipped') {
      skipped += 1;
      lines.push(`  SKIP  ${r.caseName} — ${r.error ?? 'skipped'}`);
    } else {
      errors += 1;
      lines.push(`  ERROR ${r.caseName} — ${r.error ?? 'unknown error'}`);
    }
  }
  lines.push(`${passed} passed, ${failed} failed, ${skipped} skipped, ${errors} error${errors === 1 ? '' : 's'}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests, typecheck, full suite**

Run: `npx vitest run tests/host/run-controller.test.ts && npm run check && npm test`
Expected: all green. (Note the summary pluralization: `1 error` vs `0 errors`/`2 errors` — both tests pin it.)

- [ ] **Step 5: Commit**

```bash
git add src/host/run-controller.ts tests/host/run-controller.test.ts
git commit -m "feat: run controller with deterministic text report"
```

---

### Task 6: Extension wiring (`src/extension.ts`)

The only vscode-importing file. Adapts VS Code onto the host seams: diagnostics (debounced), completions/hover, status-bar environment switcher, and the four commands. The language module is DYNAMIC-imported so `graphql-language-service` never rides activation (conventions lazy rule; `loadSchema` already lazy-imports `graphql` internally).

**Files:**
- Modify: `src/extension.ts` (replace the stub entirely)
- Create: `.vscode/launch.json`

**Interfaces:**
- Consumes: everything from Tasks 2–5 plus core `loadSchema`, `createFetchTransport`.
- Produces: the running extension. Command ids and behaviors exactly as contributed in Task 1.

Key behaviors (binding):
- Manifest/schema problems are NEVER squiggled onto `.salvo` docs (coordinate rule): they surface once per project as a warning message naming the file.
- Positions convert at this boundary only: host 1-based ↔ VS Code 0-based.
- Active environment is persisted in `workspaceState` under key `salvo.activeEnvironment` as a `Record<projectId, envName>`.
- Secrets: `context.secrets` passed straight to the host adapter (it satisfies `SecretStore` structurally).

- [ ] **Step 1: Replace src/extension.ts**

```ts
import * as vscode from 'vscode';
import type { GraphQLSchema } from 'graphql';
import { createFetchTransport } from './core/http/fetch-transport';
import { loadSchema } from './core/schema/load-schema';
import type { ParseIssue } from './core/types';
import { locateManifest, pickEnvironment, type FileSystemLike, type LocatedManifest } from './host/manifest-locator';
import { createSecretResolver, makeSecretKey } from './host/secrets';
import { runSalvoFile } from './host/run-controller';

const SELECTOR: vscode.DocumentSelector = { language: 'yaml', pattern: '**/*.salvo' };
const ENV_STATE_KEY = 'salvo.activeEnvironment';
const DEBOUNCE_MS = 300;

/** graphql-language-service must not ride activation; load it on first use. */
type LangModule = typeof import('./host/salvo-language');
let langPromise: Promise<LangModule> | undefined;
const lang = (): Promise<LangModule> => (langPromise ??= import('./host/salvo-language'));

interface ProjectContext {
  located?: LocatedManifest;
  schema?: GraphQLSchema;
  schemaIssues?: ParseIssue[];
  warned?: boolean;
}

const fsLike: FileSystemLike = {
  async readFile(path) {
    try {
      return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(path))).toString('utf8');
    } catch {
      return undefined;
    }
  },
};

const dirOf = (uri: vscode.Uri): string => {
  const p = uri.path;
  return p.slice(0, p.lastIndexOf('/')) || '/';
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('salvo');
  const output = vscode.window.createOutputChannel('Salvo');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'salvo.selectEnvironment';
  const contexts = new Map<string, ProjectContext>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const isSalvo = (doc: vscode.TextDocument): boolean => vscode.languages.match(SELECTOR, doc) > 0;

  const warnOnce = (ctx: ProjectContext, message: string): void => {
    if (ctx.warned) return;
    ctx.warned = true;
    void vscode.window.showWarningMessage(`Salvo: ${message}`);
  };

  async function getProject(doc: vscode.TextDocument): Promise<{ key: string; ctx: ProjectContext }> {
    const stopDir = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.path ?? dirOf(doc.uri);
    const located = await locateManifest(fsLike, dirOf(doc.uri), stopDir);
    if (!located.ok) {
      const key = dirOf(doc.uri);
      const ctx = contexts.get(key) ?? {};
      contexts.set(key, ctx);
      // Coordinate rule: salvo.yaml problems belong to salvo.yaml, never to this doc.
      warnOnce(ctx, located.issues[0]?.message ?? 'salvo.yaml is invalid');
      return { key, ctx };
    }
    const key = located.found?.dir ?? dirOf(doc.uri);
    let ctx = contexts.get(key);
    if (!ctx) {
      ctx = {};
      contexts.set(key, ctx);
    }
    ctx.located = located.found;

    const src = located.found?.manifest.schema;
    if (src && ctx.schema === undefined && ctx.schemaIssues === undefined) {
      const base = located.found!.dir;
      const abs = (p: string): string => (p.startsWith('/') ? p : `${base}/${p}`);
      const loaded = await loadSchema({
        source: {
          ...src,
          ...(src.sdl !== undefined ? { sdl: abs(src.sdl) } : {}),
          ...(src.introspection !== undefined ? { introspection: abs(src.introspection) } : {}),
        },
        readFile: async (p) => {
          const text = await fsLike.readFile(p);
          if (text === undefined) throw new Error('file not found');
          return text;
        },
        httpPost: async (url, headers, body) => {
          const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
          return await res.text();
        },
      });
      if (loaded.ok) {
        ctx.schema = loaded.schema;
      } else {
        ctx.schemaIssues = loaded.issues;
        // Coordinate rule: schema-source problems name their own file; warn, don't squiggle.
        warnOnce(ctx, `schema failed to load — ${loaded.issues[0]?.message ?? 'unknown error'}`);
      }
    }
    return { key, ctx };
  }

  const envFor = (ctx: ProjectContext): string | undefined => {
    const saved = context.workspaceState.get<Record<string, string>>(ENV_STATE_KEY, {});
    const id = ctx.located?.manifest.id;
    return pickEnvironment(ctx.located?.manifest, id !== undefined ? saved[id] : undefined);
  };

  const toDiagnostic = (doc: vscode.TextDocument) => (i: ParseIssue): vscode.Diagnostic => {
    const start = new vscode.Position(Math.max(0, i.line - 1), Math.max(0, i.col - 1));
    const range = doc.validateRange(new vscode.Range(start, start.translate(0, 1)));
    const d = new vscode.Diagnostic(
      range,
      i.message,
      i.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
    );
    d.source = 'salvo';
    return d;
  };

  async function refreshDiagnostics(doc: vscode.TextDocument): Promise<void> {
    if (!isSalvo(doc)) return;
    const { ctx } = await getProject(doc);
    const { collectDiagnostics } = await lang();
    const issues = collectDiagnostics(doc.getText(), ctx.schema);
    diagnostics.set(doc.uri, issues.map(toDiagnostic(doc)));
  }

  const scheduleRefresh = (doc: vscode.TextDocument): void => {
    if (!isSalvo(doc)) return;
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => void refreshDiagnostics(doc), DEBOUNCE_MS));
  };

  async function updateStatus(editor: vscode.TextEditor | undefined): Promise<void> {
    const doc = editor?.document;
    if (!doc || !isSalvo(doc)) {
      status.hide();
      return;
    }
    const { ctx } = await getProject(doc);
    status.text = `Salvo: ${envFor(ctx) ?? 'no environment'}`;
    status.show();
  }

  const requireSalvoEditor = (): vscode.TextEditor | undefined => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSalvo(editor.document)) {
      void vscode.window.showInformationMessage('Salvo: open a .salvo file first.');
      return undefined;
    }
    return editor;
  };

  context.subscriptions.push(
    diagnostics,
    output,
    status,
    vscode.workspace.onDidOpenTextDocument(scheduleRefresh),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
    vscode.window.onDidChangeActiveTextEditor((e) => void updateStatus(e ?? undefined)),

    vscode.languages.registerCompletionItemProvider(SELECTOR, {
      async provideCompletionItems(doc, position) {
        const { ctx } = await getProject(doc);
        const { completionsInFile } = await lang();
        return completionsInFile(doc.getText(), ctx.schema, { line: position.line + 1, col: position.character + 1 }).map(
          (c) => {
            const item = new vscode.CompletionItem(c.label, vscode.CompletionItemKind.Field);
            if (c.detail !== undefined) item.detail = c.detail;
            if (typeof c.documentation === 'string') item.documentation = c.documentation;
            return item;
          }
        );
      },
    }),

    vscode.languages.registerHoverProvider(SELECTOR, {
      async provideHover(doc, position) {
        const { ctx } = await getProject(doc);
        const { hoverInFile } = await lang();
        const text = hoverInFile(doc.getText(), ctx.schema, { line: position.line + 1, col: position.character + 1 });
        return text === undefined ? undefined : new vscode.Hover(new vscode.MarkdownString().appendCodeblock(text, 'graphql'));
      },
    }),

    vscode.commands.registerCommand('salvo.runCases', async () => {
      const editor = requireSalvoEditor();
      if (!editor) return;
      const doc = editor.document;
      const { ctx } = await getProject(doc);
      const manifest = ctx.located?.manifest;
      const envName = envFor(ctx) ?? 'default';
      const secrets = createSecretResolver(context.secrets, manifest?.id ?? 'no-project', envName);
      const outcome = await runSalvoFile({
        fileText: doc.getText(),
        manifest,
        envName,
        deps: { secrets, send: createFetchTransport() },
      });
      if (!outcome.ok) {
        void vscode.window.showErrorMessage(`Salvo: cannot run — ${outcome.issues[0]?.message ?? 'parse failed'}`);
        return;
      }
      output.appendLine('');
      output.appendLine(outcome.report);
      output.show(true);
    }),

    vscode.commands.registerCommand('salvo.selectEnvironment', async () => {
      const editor = requireSalvoEditor();
      if (!editor) return;
      const { ctx } = await getProject(editor.document);
      const manifest = ctx.located?.manifest;
      const names = Object.keys(manifest?.environments ?? {});
      if (!manifest || names.length === 0) {
        void vscode.window.showInformationMessage('Salvo: no environments defined in salvo.yaml.');
        return;
      }
      const picked = await vscode.window.showQuickPick(names, { placeHolder: 'Salvo environment' });
      if (picked === undefined) return;
      const saved = context.workspaceState.get<Record<string, string>>(ENV_STATE_KEY, {});
      await context.workspaceState.update(ENV_STATE_KEY, { ...saved, [manifest.id]: picked });
      await updateStatus(editor);
      scheduleRefresh(editor.document);
    }),

    vscode.commands.registerCommand('salvo.setSecret', async () => {
      const editor = requireSalvoEditor();
      if (!editor) return;
      const { ctx } = await getProject(editor.document);
      const manifest = ctx.located?.manifest;
      if (!manifest) {
        void vscode.window.showInformationMessage('Salvo: a salvo.yaml with an id is required to store secrets.');
        return;
      }
      const envName = envFor(ctx) ?? 'default';
      const name = await vscode.window.showInputBox({
        prompt: `Secret name for environment "${envName}"`,
        validateInput: (v) => (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(v) ? undefined : 'Letters, digits, _ . - only; must not start with a digit.'),
      });
      if (name === undefined || name === '') return;
      const value = await vscode.window.showInputBox({ prompt: `Value for {{secret:${name}}}`, password: true });
      if (value === undefined) return;
      await context.secrets.store(makeSecretKey(manifest.id, envName, name), value);
      void vscode.window.showInformationMessage(`Salvo: secret "${name}" stored for "${envName}".`);
    }),

    vscode.commands.registerCommand('salvo.refreshSchema', async () => {
      contexts.clear();
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        scheduleRefresh(editor.document);
        await updateStatus(editor);
      }
      void vscode.window.showInformationMessage('Salvo: schema cache cleared.');
    })
  );

  for (const doc of vscode.workspace.textDocuments) scheduleRefresh(doc);
  void updateStatus(vscode.window.activeTextEditor ?? undefined);
}

export function deactivate(): void {}
```

- [ ] **Step 2: Create .vscode/launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}", "${workspaceFolder}/examples/quickstart"],
      "preLaunchTask": null
    }
  ]
}
```

- [ ] **Step 3: Verify build, types, and the whole suite**

Run: `npm run build && npm run check && npm test && npm run gen:check`
Expected: all green (extension.ts compiles against @types/vscode 1.110; the bundle still exports activate/deactivate — re-run the Task 1 node check).
Also: `node -e "const s=require('node:fs').readFileSync('dist/extension.js','utf8'); if(!/require\(\"vscode\"\)|require\('vscode'\)/.test(s)) process.exit(1); console.log('vscode stays external')"`

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts .vscode/launch.json
git commit -m "feat: wire diagnostics, completions, hover, environments, secrets, and runs"
```

---

### Task 7: Electron smoke test and packaging gate

**Files:**
- Create: `tsconfig.test.json`, `.vscode-test.mjs`, `tests/vscode/extension.smoke.test.ts`, `CHANGELOG.md`
- Modify: `package.json` (scripts + devDeps), `vitest.config.ts` (exclude the electron tests)

**Interfaces:**
- Consumes: the packaged extension surface from Tasks 1+6.
- Produces: `npm run test:vscode` (real VS Code, activation + command registration) and `npm run package` (vsce → .vsix). This is plan 3a's exit gate.

- [ ] **Step 1: Add devDeps and scripts**

Run: `npm install -D @vscode/test-cli@^0.0.11 @vscode/test-electron@^2.5.2 @types/mocha@^10.0.10 --no-audit --no-fund`

package.json scripts, add:
```json
    "pretest:vscode": "npm run build && tsc -p tsconfig.test.json",
    "test:vscode": "vscode-test",
    "package": "npm run build && vsce package"
```

- [ ] **Step 2: Test harness config**

`tsconfig.test.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node10",
    "outDir": "out-test",
    "types": ["mocha", "node", "vscode"]
  },
  "include": ["tests/vscode"]
}
```

`.vscode-test.mjs`:
```js
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/vscode/**/*.test.js',
  workspaceFolder: 'examples/quickstart',
  mocha: { timeout: 20000 },
});
```

In `vitest.config.ts`, change the include so vitest never grabs the mocha files:
```ts
  test: { include: ['tests/core/**/*.test.ts', 'tests/host/**/*.test.ts'], environment: 'node' },
```
Also append `out-test/**` and `dist/**` to `.vscodeignore`, add lines `out-test/` and `dist/` to `.gitignore`, and add to the ROOT `tsconfig.json`:
```json
  "exclude": ["tests/vscode", "out", "out-test", "dist"]
```
(the mocha globals in tests/vscode would otherwise break `npm run check`, which compiles with vitest-free types).

- [ ] **Step 3: Write the smoke test**

`tests/vscode/extension.smoke.test.ts`:
```ts
import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('salvo extension smoke', () => {
  test('activates in the quickstart workspace and registers its commands', async () => {
    const ext = vscode.extensions.getExtension('jungsehui.salvo');
    assert.ok(ext, 'extension jungsehui.salvo not found');
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['salvo.runCases', 'salvo.selectEnvironment', 'salvo.setSecret', 'salvo.refreshSchema']) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });
});
```

- [ ] **Step 4: CHANGELOG.md**

```markdown
# Changelog

## 0.1.0 (unreleased)

First functional slice, GraphQL-first:

- `.salvo` request files with named cases and declarative expectations
- GraphQL diagnostics, completions, and hover inside the text editor,
  powered by a local SDL file, an introspection JSON file, or (opt-in)
  live introspection — no account, no cloud
- Environments in `salvo.yaml`, secrets in VS Code `SecretStorage`
- `Salvo: Run Cases in Current File` with a per-case pass/fail report
```

- [ ] **Step 5: Run the electron smoke and the packaging gate**

Run: `npm run test:vscode`
Expected: downloads VS Code on first run, then `1 passing`. If the download is blocked by the environment, report BLOCKED with the exact error — do not fake the result.
Then: `npm run package`
Expected: `salvo-0.1.0.vsix` produced (warnings about a missing icon are acceptable; errors are not).
Then the full local gate: `npm test && npm run check && npm run gen:check`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.test.json .vscode-test.mjs tests/vscode/ CHANGELOG.md vitest.config.ts .vscodeignore .gitignore
git commit -m "test: electron activation smoke and vsce packaging gate"
```

---

## Exit Criteria for Plan 3a

- `npm test` (vitest, core+host), `npm run check`, `npm run gen:check`, `npm run build`, `npm run test:vscode`, `npm run package` — all green.
- Purity guard covers `src/core` AND `src/host`; only `src/extension.ts` touches vscode.
- Manual F5 sanity (documented, not automated): open `examples/quickstart/countries.salvo` — YAML highlighting, env in the status bar, `Salvo: Run Cases` prints a report against the public demo API.
- `grep -ri "linkareer" src tests examples schemas` still empty.

## What Plan 3b Will Consume

- `runSalvoFile`'s structured `results` (the webview renders them instead of the text report).
- The `ProjectContext` schema cache and `lang()` dynamic-import pattern.
- The GUI must coerce form strings to schema types before `updateScalar` (plan 1 carried note), and `|2` explicit-indent operations still silently mismap (parked minor — fix before the GUI relies on precise positions).
