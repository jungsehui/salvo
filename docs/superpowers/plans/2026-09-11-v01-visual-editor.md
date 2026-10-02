# Salvo v0.1 Visual Editor Implementation Plan (plan 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.salvo` files open in a custom editor (Reopen With, a title-bar button, or `Salvo: Open Visual Editor`) that shows the request, its cases, and the last run's responses; form edits go back to the text document as minimal range edits with echo suppression; the operation editor is CodeMirror 6 with schema-driven completion, diagnostics, and hover served by the extension host; runs started from the GUI or from the command palette both land in a host-owned run store that every open editor renders.

**Architecture:** The webview is dumb by design. It renders a snapshot the host pushes (`state`), sends intents (`edit`, `run`, `lang`), and never parses YAML, never touches the network, and never sees a secret. Every piece of logic that can be pure lives in `src/core`/`src/host` (vscode-free, vitest-tested): comment-preserving structural edits, minimal text diffing, string-to-type coercion, echo suppression, redaction, the run store, the CSP-locked HTML builder, and the message validator. `src/shared/protocol.ts` is the wire contract both sides import. `src/editor-provider.ts` joins `src/extension.ts` as the only vscode importers. The webview's own logic (state reducer, request/response correlation) is pure too and tested under vitest in the node environment; React components are verified by typecheck, bundle, and the real-VS Code smoke test.

**Tech Stack:** adds runtime deps (all bundled into `dist/webview.js` by esbuild, never shipped as node_modules) `react` 19.2.8, `react-dom` 19.2.8, `@codemirror/state` 6.7.4, `@codemirror/view` 6.43.11, `@codemirror/autocomplete` 6.20.3, `@codemirror/lint` 6.9.7, `@codemirror/language` 6.12.4, `@codemirror/commands` 6.11.0; devDeps `@types/react` 19.2.18, `@types/react-dom` 19.2.7 (versions verified on npm 2026-09-09). NOT added: `cm6-graphql`/`codemirror-graphql` (they pull `graphql` and `graphql-language-service` into the webview bundle; the host already owns that intelligence), `@vscode/webview-ui-toolkit` (archived). Highlighting is a 30-line `StreamLanguage` tokenizer.

**Spec:** `.claude/architecture.md` decisions 1, 2, 8, 9, 10 and `.claude/roadmap.md` minimum items 1, 3, 5. Consumes plan 1–3a interfaces as shipped: `parseSalvoFile`, `updateScalar`, `runCases`, `runSalvoFile`/`formatRunReport`, `locateOperation`, `getDiagnostics`/`getAutocompleteSuggestions`/`getHoverInformation` (via `graphql-language`), `getProject`/`envFor`/`lang()` in `extension.ts`.

**Plan set:** plan 3b of the v0.1 set (the last one). Carried notes it discharges: the `|N` explicit-indent mismap (plan 2 parked minor), form-string-to-schema-type coercion before `updateScalar` (plan 1 note), secret redaction before results reach a webview (plan 3a final-review tripwire), `isClosed`/stale-editor guards when reusing the refresh pattern (plan 3a).

## Global Constraints

- **vscode importers:** only `src/extension.ts` and `src/editor-provider.ts`. `src/core/**`, `src/host/**`, `src/shared/**`, `src/webview/**` never contain the module string `'vscode'` (per-directory guard, Task 4 widens it).
- **Webview purity:** `src/webview/**` and `src/shared/**` never import `node:*`, `yaml`, `ajv`, `graphql`, `graphql-language-service`, and never import a VALUE from `src/core` or `src/host` (`import type … from '../core/…'` is allowed; the guard checks the line starts with `import type`). React components never use the `style` prop (CSP forbids inline styles; the guard greps `.tsx` for `style={{`).
- **Network only in the extension host** (decision 1). The webview never calls `fetch`.
- **CSP** exactly: `default-src 'none'; img-src ${cspSource}; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${cspSource}`. No `'unsafe-inline'`, no `'unsafe-eval'`. CodeMirror receives the nonce through `EditorView.cspNonce`.
- **Custom editor** `viewType` `salvo.editor`, `priority: "option"` (decision 2), `retainContextWhenHidden` off (conventions). Discovery: command `salvo.openEditor` ("Salvo: Open Visual Editor") plus an `editor/title` button on `.salvo` files.
- **State ownership** (decision 8): run results in the host `RunStore` keyed by document URI; active environment in `workspaceState` under the existing key `salvo.activeEnvironment`; the webview keeps only UI-local state and re-pulls with `ready` whenever it is (re)created.
- **Document sync** (decision 9): edits are the smallest single range replacement between the old text and the yaml-serialized new text (9.1); the host's own `WorkspaceEdit` is suppressed by text equality in `EchoGuard` (9.2); while the text is broken the GUI keeps the last good model and shows a banner (9.3); every foreign change pushes a fresh snapshot (9.4); operation edits keep the `|` clip style by preserving the trailing newline (9.5).
- **Untrusted webview:** every incoming message passes `isWebviewMessage`; anything else is ignored.
- **Secrets never reach the webview:** `runSalvoFile` records every resolved secret value and redacts values of 4+ characters from results and the text report before returning.
- **Language positions:** the webview and host exchange 0-based `{ line, character }` positions relative to the operation text (never file positions).
- English-only user-facing strings; generic (no company values); no telemetry; `engines.vscode` stays `^1.110.0`.
- Node 20+, TS strict clean, kebab-case files (React components `PascalCase.tsx`), `npm test && npm run check && npm run gen:check && npm run build` green at every commit.
- **How to run verification (amended 2026-10-02, machine rule):** heavy commands (vitest, build, test:vscode, package) run one per shell call through `memguard`, and every call gets Node 24 through a PATH prefix (`@vscode/test-electron` needs Node 22+; the default shell has Node 20). The shell hook blocks chains such as `npm test && npm run check`. Wherever a step below chains commands with `&&`, run each link as its own call in this form:
  `PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" memguard -- npm test` (likewise `memguard -- npx vitest run <files>`, `memguard -- npm run build`, `memguard -- npm run test:vscode`, `memguard -- npm run package`). Light commands keep the prefix without memguard: `PATH="…" npm run check`, `PATH="…" npm run gen:check`. A trailing `| tail` pipe is fine.
- **Commits** end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## File Structure

```
esbuild.mjs                          # two builds: host (dist/extension.js) + webview (dist/webview.js + dist/webview.css)
tsconfig.webview.json                # DOM lib, react-jsx, types: [] (no node globals in the webview)
src/
├─ extension.ts                      # composition root: services object, RunStore, runDocument, provider registration
├─ editor-provider.ts                # CustomTextEditorProvider: html, message loop, edits, snapshot pushes
├─ shared/
│  └─ protocol.ts                    # wire types shared by host, core, webview + isWebviewMessage guard
├─ core/
│  ├─ format/edit-structure.ts       # appendCase / removeCase (yaml, comment-preserving)
│  ├─ format/minimal-edit.ts         # minimalTextEdit(old, new) -> single range replacement
│  ├─ lang/graphql-language.ts       # + text-relative diagnostics/completions/hover (file-positioned ones map through them)
│  ├─ lang/operation-source.ts       # |N explicit indentation indicator fix
│  └─ runner/redact.ts               # redactText / redactResults
├─ host/
│  ├─ run-controller.ts              # recording resolver + redaction + `selected`
│  ├─ run-store.ts                   # RunStore (Map<uri, RunEntry> + listeners) + mergeResults
│  ├─ document-sync.ts               # buildDocumentView, coerceLike, applyFieldEdit, EchoGuard
│  ├─ salvo-language.ts              # + completionsInOperation / diagnosticsInOperation / hoverInOperation
│  └─ webview-html.ts                # buildWebviewHtml (CSP)
└─ webview/
   ├─ main.tsx                       # mount + bridge + `ready`
   ├─ bridge.ts                      # postMessage + lang request/response correlation (pure)
   ├─ state.ts                       # reducer over HostToWebview (pure)
   ├─ graphql-stream.ts              # StreamLanguage tokenizer for highlighting
   ├─ App.tsx, RequestPanel.tsx, CasesPanel.tsx, ResultsPanel.tsx, ScalarField.tsx, OperationEditor.tsx
   ├─ vscode-api.d.ts                # acquireVsCodeApi declaration
   └─ styles.css
tests/core/{edit-structure,minimal-edit,redact}.test.ts   (new)
tests/core/module-purity.test.ts                         (new; widened guard)
tests/core/{operation-source,graphql-language}.test.ts   (extended)
tests/host/{document-sync,run-store,webview-html}.test.ts (new)
tests/host/{run-controller,salvo-language}.test.ts        (extended)
tests/shared/protocol.test.ts, tests/webview/{state,bridge}.test.ts (new)
tests/vscode/extension.smoke.test.ts                       (extended)
```

---

### Task 1: Core polish batch (explicit indent, text-relative language ops, secret redaction)

Three small, independent corrections that later tasks build on. Batched because each is a two-file edit with its own test.

**Files:**
- Modify: `src/core/lang/operation-source.ts`
- Modify: `src/core/lang/graphql-language.ts` (rewrite: text-relative functions become the base, file-positioned ones map through them)
- Create: `src/shared/protocol.ts` (ONLY the two position types this task needs; Task 3 adds the rest)
- Create: `src/core/runner/redact.ts`
- Modify: `src/host/run-controller.ts`
- Test: add cases to `tests/core/operation-source.test.ts`, `tests/core/graphql-language.test.ts`, `tests/host/run-controller.test.ts`; create `tests/core/redact.test.ts`

**Interfaces:**
- Consumes: `locateOperation`, gls functions, `runCases`, `RunResult`, `SecretResolver`, `Transport`.
- Produces:
  ```ts
  // src/shared/protocol.ts (partial; Task 3 extends this file)
  export interface TextPosition { line: number; character: number }   // 0-based, relative to the operation text
  export interface LangDiagnostic { message: string; start: TextPosition; end: TextPosition; severity: 'error' | 'warning' }
  // src/core/lang/graphql-language.ts
  export function getDiagnosticsInText(schema: GraphQLSchema, text: string): LangDiagnostic[];
  export function getCompletionsInText(schema: GraphQLSchema, text: string, pos: TextPosition): CompletionItem[];
  export function getHoverInText(schema: GraphQLSchema, text: string, pos: TextPosition): string | undefined;
  // src/core/runner/redact.ts
  export const REDACTED = '<redacted>'; export const MIN_REDACT_LENGTH = 4;
  export function redactText(text: string, values: readonly string[]): string;
  export function redactResults(results: RunResult[], values: readonly string[]): RunResult[];
  // src/host/run-controller.ts — runSalvoFile gains `selected?: number[] | 'all'` and redacts
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/operation-source.test.ts` inside its top-level `describe`:
```ts
  it('honours an explicit indentation indicator (|2) so leading spaces stay content', () => {
    // 1 salvo / 2 request: / 3 url / 4 operation: |2 / 5 "      query A {" / 6 "      me { id }" / 7 "    }"
    const text = `salvo: 1\nrequest:\n  url: "http://x"\n  operation: |2\n      query A {\n      me { id }\n    }\n`;
    const r = locateOperation(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source.text).toBe('  query A {\n  me { id }\n}\n');
    // op line 0, character 2 is the 'q' of "query": file line 5, col 7 (content indent is 2 + 2 = 4)
    expect(r.source.toFilePosition({ line: 0, character: 2 })).toEqual({ line: 5, col: 7 });
    expect(r.source.fromFilePosition({ line: 5, col: 7 })).toEqual({ line: 0, character: 2 });
  });
```

Append to `tests/core/graphql-language.test.ts` (new top-level describe; extend the existing import line with `getCompletionsInText, getDiagnosticsInText, getHoverInText`):
```ts
describe('graphql-language (operation-text coordinates)', () => {
  const text = 'query Bad {\n  me { nope }\n}\n';

  it('reports diagnostics with 0-based start and end positions', () => {
    const [d] = getDiagnosticsInText(schema, text);
    expect(d?.message).toContain('nope');
    expect(d?.start).toEqual({ line: 1, character: 7 });
    expect(d?.end).toEqual({ line: 1, character: 12 });
    expect(d?.severity).toBe('error');
  });

  it('completes and hovers at text positions', () => {
    expect(getCompletionsInText(schema, text, { line: 1, character: 7 }).map((c) => c.label)).toContain('id');
    expect(getHoverInText(schema, text, { line: 1, character: 3 })).toBe('Query.me: User');
  });
});
```

Create `tests/core/redact.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { REDACTED, redactResults, redactText } from '../../src/core/runner/redact';
import type { RunResult } from '../../src/core/types';

const result: RunResult = {
  caseIndex: 0,
  caseName: 'c',
  outcome: 'failed',
  assertions: [{ target: 'json data.token', expected: 'equals "x"', actual: '"tok-12345"', pass: false }],
  response: {
    status: 200,
    headers: { 'x-echo': 'tok-12345' },
    bodyText: '{"token":"tok-12345"}',
    json: { token: 'tok-12345', nested: ['tok-12345'] },
    durationMs: 1,
  },
  error: 'server said tok-12345',
};

describe('redact', () => {
  it('replaces every occurrence of a secret value', () => {
    expect(redactText('a tok-12345 b tok-12345', ['tok-12345'])).toBe(`a ${REDACTED} b ${REDACTED}`);
  });

  it('ignores values shorter than four characters so unrelated text survives', () => {
    expect(redactText('status 200 ok', ['200', 'ok'])).toBe('status 200 ok');
  });

  it('redacts the longer value first when one secret contains another', () => {
    expect(redactText('abcdef', ['abcd', 'abcdef'])).toBe(REDACTED);
  });

  it('walks results deeply without mutating the input', () => {
    const out = redactResults([result], ['tok-12345']);
    expect(JSON.stringify(out)).not.toContain('tok-12345');
    expect(out[0]?.response?.json).toEqual({ token: REDACTED, nested: [REDACTED] });
    expect(out[0]?.response?.headers['x-echo']).toBe(REDACTED);
    expect(out[0]?.error).toBe(`server said ${REDACTED}`);
    expect(result.error).toBe('server said tok-12345');
  });

  it('returns the same array when nothing qualifies', () => {
    const arr = [result];
    expect(redactResults(arr, ['ab'])).toBe(arr);
  });
});
```

Append to `tests/host/run-controller.test.ts` inside `describe('runSalvoFile', …)`:
```ts
  it('redacts resolved secret values from results and the report', async () => {
    const doc = `salvo: 1
request:
  url: "http://x.test/graphql"
  headers: { auth: "{{secret:TOKEN}}", mode: "{{mode}}" }
  operation: |
    query { ok }
vars: { mode: echo }
cases:
  - name: echo
    expect: { json: { "data.echo": "nope" } }
  - name: boom
    vars: { mode: boom }
`;
    const echoing: Transport = async (req): Promise<HttpResponse> => {
      const token = req.headers['auth'] ?? '';
      if (req.headers['mode'] === 'boom') throw new Error(`rejected token ${token}`);
      const json = { data: { echo: token } };
      return { status: 200, headers: { 'x-echo': token }, bodyText: JSON.stringify(json), json, durationMs: 1 };
    };
    const r = await runSalvoFile({
      fileText: doc,
      manifest: undefined,
      envName: 'default',
      deps: { secrets: async (n) => (n === 'TOKEN' ? 's3cret-value' : undefined), send: echoing },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.results) + r.report).not.toContain('s3cret-value');
    expect(r.results[0]?.response?.headers['x-echo']).toBe('<redacted>');
    expect(r.results[1]?.error).toBe('rejected token <redacted>');
  });

  it('runs only the selected cases', async () => {
    const r = await runSalvoFile({ fileText: DOC, manifest: undefined, envName: 'default', selected: [2], deps: { secrets: async () => undefined, send } });
    expect(r.ok && r.results.map((x) => x.caseIndex)).toEqual([2]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/operation-source.test.ts tests/core/graphql-language.test.ts tests/core/redact.test.ts tests/host/run-controller.test.ts`
Expected: the four new/changed groups FAIL (explicit-indent position wrong; missing exports; module not found; secret leaks / `selected` ignored).

- [ ] **Step 3: Create `src/shared/protocol.ts` (partial)**

```ts
/**
 * Types shared by the extension host, the core, and the webview. This file
 * must stay dependency-free: the webview bundle imports it, and the purity
 * guard forbids anything but type imports here.
 */

/** 0-based position inside an operation text (CodeMirror's coordinate space). */
export interface TextPosition {
  line: number;
  character: number;
}

export interface LangDiagnostic {
  message: string;
  start: TextPosition;
  end: TextPosition;
  severity: 'error' | 'warning';
}
```

- [ ] **Step 4: Fix the explicit indentation indicator in `src/core/lang/operation-source.ts`**

Replace the block that begins `// Relies on YAML auto-detected indentation` through the closing `}` of its `for` loop with:
```ts
  const indent = blockContentIndent(node, fileLines, contentStartLine);
```
and add this function at the bottom of the file:
```ts
/**
 * Column where block content starts. With an explicit indentation indicator
 * ('|2') the content indent is the parent indent plus the digit, and any
 * further leading spaces are content (yaml's CST exposes both). Otherwise
 * YAML auto-detects it from the first non-blank content line, which therefore
 * cannot overshoot the block.
 */
function blockContentIndent(node: Scalar, fileLines: string[], contentStartLine: number): number {
  const token = node.srcToken as unknown as { indent?: number; props?: { type: string; source: string }[] } | undefined;
  const header = token?.props?.find((p) => p.type === 'block-scalar-header');
  const digit = header ? /[1-9]/.exec(header.source)?.[0] : undefined;
  if (digit !== undefined && token?.indent !== undefined) return token.indent + Number(digit);
  for (let l = contentStartLine - 1; l < fileLines.length; l += 1) {
    const lineText = fileLines[l]!;
    if (lineText.trim().length > 0) return lineText.length - lineText.trimStart().length;
  }
  return 0;
}
```

- [ ] **Step 5: Rewrite `src/core/lang/graphql-language.ts`**

```ts
import { type GraphQLSchema } from 'graphql';
import {
  getAutocompleteSuggestions,
  getDiagnostics,
  getHoverInformation,
  getOperationFacts,
  getVariablesJSONSchema,
  Position,
  type CompletionItem,
} from 'graphql-language-service';
import type { LangDiagnostic, TextPosition } from '../../shared/protocol';
import type { ParseIssue } from '../types';
import type { OperationSource } from './operation-source';

export type { CompletionItem };

/** Diagnostics in operation-text coordinates; the file-positioned variant maps these through the OperationSource. */
export function getDiagnosticsInText(schema: GraphQLSchema, text: string): LangDiagnostic[] {
  return getDiagnostics(text, schema).map((d) => {
    const msg = typeof d.message === 'string' ? d.message : d.message.value;
    return {
      message: msg.split('\n')[0] ?? msg,
      start: { line: d.range.start.line, character: d.range.start.character },
      end: { line: d.range.end.line, character: d.range.end.character },
      severity: d.severity === 2 ? ('warning' as const) : ('error' as const),
    };
  });
}

export function getCompletionsInText(schema: GraphQLSchema, text: string, pos: TextPosition): CompletionItem[] {
  return getAutocompleteSuggestions(schema, text, new Position(pos.line, pos.character));
}

export function getHoverInText(schema: GraphQLSchema, text: string, pos: TextPosition): string | undefined {
  const contents = getHoverInformation(schema, text, new Position(pos.line, pos.character));
  return typeof contents === 'string' && contents.length > 0 ? contents : undefined;
}

export function getOperationDiagnostics(schema: GraphQLSchema, op: OperationSource): ParseIssue[] {
  return getDiagnosticsInText(schema, op.text).map((d) => {
    const { line, col } = op.toFilePosition(d.start);
    return { message: d.message, line, col, severity: d.severity };
  });
}

export function getCompletionsAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): CompletionItem[] {
  const pos = op.fromFilePosition(filePos);
  return pos ? getCompletionsInText(schema, op.text, pos) : [];
}

export function getHoverAt(
  schema: GraphQLSchema,
  op: OperationSource,
  filePos: { line: number; col: number }
): string | undefined {
  const pos = op.fromFilePosition(filePos);
  return pos ? getHoverInText(schema, op.text, pos) : undefined;
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

- [ ] **Step 6: Create `src/core/runner/redact.ts`**

```ts
import type { RunResult } from '../types';

export const REDACTED = '<redacted>';
/** Shorter values would blank unrelated text ("200", "ok"); they are left alone and documented as such. */
export const MIN_REDACT_LENGTH = 4;

const qualifying = (values: readonly string[]): string[] =>
  // Longest first, so a secret that contains another leaves no fragment behind.
  values.filter((v) => v.length >= MIN_REDACT_LENGTH).sort((a, b) => b.length - a.length);

export function redactText(text: string, values: readonly string[]): string {
  let out = text;
  for (const v of qualifying(values)) out = out.split(v).join(REDACTED);
  return out;
}

function redactUnknown(value: unknown, values: readonly string[]): unknown {
  if (typeof value === 'string') return redactText(value, values);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v, values));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactUnknown(v, values)]));
  }
  return value;
}

/** Copies of the results with every secret value replaced; inputs are never mutated. */
export function redactResults(results: RunResult[], values: readonly string[]): RunResult[] {
  const active = qualifying(values);
  if (active.length === 0) return results;
  return results.map((r) => ({
    ...r,
    ...(r.error !== undefined ? { error: redactText(r.error, active) } : {}),
    assertions: r.assertions.map((a) => ({ ...a, expected: redactText(a.expected, active), actual: redactText(a.actual, active) })),
    ...(r.response
      ? {
          response: {
            ...r.response,
            headers: Object.fromEntries(Object.entries(r.response.headers).map(([k, v]) => [k, redactText(v, active)])),
            bodyText: redactText(r.response.bodyText, active),
            ...(r.response.json !== undefined ? { json: redactUnknown(r.response.json, active) } : {}),
          },
        }
      : {}),
  }));
}
```

- [ ] **Step 7: Wire redaction and `selected` into `src/host/run-controller.ts`**

Replace `runSalvoFile` (keep `formatRunReport` as is):
```ts
import { redactResults } from '../core/runner/redact';
// (add to the existing imports)

export async function runSalvoFile(args: {
  fileText: string;
  manifest: SalvoManifest | undefined;
  envName: string;
  selected?: number[] | 'all';
  deps: { secrets: SecretResolver; send: Transport };
}): Promise<{ ok: false; issues: ParseIssue[] } | { ok: true; results: RunResult[]; report: string }> {
  const parsed = parseSalvoFile(args.fileText);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  // Record every resolved value so nothing a transport error or a server echo
  // carries can leak into the report or a webview (plan 3a tripwire).
  const seen = new Set<string>();
  const secrets: SecretResolver = async (name) => {
    const value = await args.deps.secrets(name);
    if (value !== undefined) seen.add(value);
    return value;
  };
  const raw = await runCases({
    file: parsed.file,
    envName: args.envName,
    manifest: args.manifest,
    selected: args.selected ?? 'all',
    deps: { secrets, send: args.deps.send },
  });
  const results = redactResults(raw, [...seen]);
  return { ok: true, results, report: formatRunReport(results, args.envName) };
}
```

- [ ] **Step 8: Run tests, typecheck, full suite**

Run: `npx vitest run tests/core/operation-source.test.ts tests/core/graphql-language.test.ts tests/core/redact.test.ts tests/host/run-controller.test.ts && npm test && npm run check && npm run gen:check && npm run build`
Expected: all green (the existing file-positioned tests still pass through the refactor).

- [ ] **Step 9: Commit**

```bash
git add src/shared/protocol.ts src/core/lang/operation-source.ts src/core/lang/graphql-language.ts src/core/runner/redact.ts src/host/run-controller.ts tests/core/operation-source.test.ts tests/core/graphql-language.test.ts tests/core/redact.test.ts tests/host/run-controller.test.ts
git commit -m "fix: explicit block indent, text-relative language ops, and secret redaction"
```

---

### Task 2: Document edit primitives (`edit-structure.ts`, `minimal-edit.ts`)

**Files:**
- Create: `src/core/format/edit-structure.ts`, `src/core/format/minimal-edit.ts`
- Test: `tests/core/edit-structure.test.ts`, `tests/core/minimal-edit.test.ts`

**Interfaces:**
- Consumes: `yaml` (`parseDocument`, `isSeq`), `parseSalvoFile` (tests only).
- Produces:
  ```ts
  export function appendCase(text: string, name: string): { ok: true; text: string } | { ok: false; error: string };
  export function removeCase(text: string, index: number): { ok: true; text: string } | { ok: false; error: string };
  export interface TextReplace { start: number; end: number; text: string }   // UTF-16 offsets into the OLD text
  export function minimalTextEdit(oldText: string, newText: string): TextReplace | undefined;   // undefined when equal
  ```

- [ ] **Step 1: Write the failing tests**

`tests/core/edit-structure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { appendCase, removeCase } from '../../src/core/format/edit-structure';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const DOC = `salvo: 1
request:
  url: "http://x"
  operation: |
    query { ok }
# cases below
cases:
  - name: first   # keep
    vars: { a: 1 }
  - name: second
`;

const names = (text: string): string[] | undefined => {
  const parsed = parseSalvoFile(text);
  return parsed.ok ? parsed.file.cases?.map((c) => c.name) : undefined;
};

describe('appendCase', () => {
  it('appends a case with empty vars and expect, preserving comments', () => {
    const r = appendCase(DOC, 'third');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('# cases below');
    expect(r.text).toContain('# keep');
    expect(names(r.text)).toEqual(['first', 'second', 'third']);
    const parsed = parseSalvoFile(r.text);
    expect(parsed.ok && parsed.file.cases?.[2]).toEqual({ name: 'third', vars: {}, expect: {} });
  });

  it('creates the cases list when the file has none', () => {
    const r = appendCase('salvo: 1\nrequest:\n  url: "http://x"\n  operation: "query { ok }"\n', 'only');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = parseSalvoFile(r.text);
    expect(parsed.ok && parsed.file.cases).toEqual([{ name: 'only', vars: {}, expect: {} }]);
  });

  it('refuses malformed YAML and a non-list cases key', () => {
    expect(appendCase('cases: [unclosed', 'x').ok).toBe(false);
    expect(appendCase('salvo: 1\ncases: nope\n', 'x').ok).toBe(false);
  });
});

describe('removeCase', () => {
  it('removes the case at an index and keeps the others in order', () => {
    const r = removeCase(DOC, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(names(r.text)).toEqual(['second']);
    expect(r.text).toContain('# cases below');
  });

  it('rejects out-of-range or non-integer indexes', () => {
    expect(removeCase(DOC, 5).ok).toBe(false);
    expect(removeCase(DOC, -1).ok).toBe(false);
    expect(removeCase(DOC, 0.5).ok).toBe(false);
    expect(removeCase('salvo: 1\n', 0).ok).toBe(false);
  });
});
```

`tests/core/minimal-edit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { minimalTextEdit } from '../../src/core/format/minimal-edit';

const apply = (text: string, r: { start: number; end: number; text: string }): string =>
  text.slice(0, r.start) + r.text + text.slice(r.end);

describe('minimalTextEdit', () => {
  it('returns undefined for identical text', () => {
    expect(minimalTextEdit('abc', 'abc')).toBeUndefined();
  });

  it('replaces only the differing middle', () => {
    const r = minimalTextEdit('url: "a"\ntimeout: 5000\n', 'url: "a"\ntimeout: 7000\n');
    expect(r).toEqual({ start: 18, end: 19, text: '7' });
  });

  it('handles pure insertions and deletions', () => {
    expect(minimalTextEdit('ab', 'aXb')).toEqual({ start: 1, end: 1, text: 'X' });
    expect(minimalTextEdit('aXb', 'ab')).toEqual({ start: 1, end: 2, text: '' });
  });

  it('never splits a surrogate pair', () => {
    const r = minimalTextEdit('x😀y', 'x😁y');
    expect(r).toEqual({ start: 1, end: 3, text: '😁' });
  });

  it('round-trips through apply', () => {
    for (const [a, b] of [['', 'new'], ['old', ''], ['same prefix A', 'same prefix B'], ['a\nb\nc', 'a\nB\nc\nd']] as const) {
      const r = minimalTextEdit(a, b);
      expect(r ? apply(a, r) : a).toBe(b);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/edit-structure.test.ts tests/core/minimal-edit.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/core/format/edit-structure.ts`**

```ts
import { parseDocument, isSeq } from 'yaml';

type EditResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Structural, comment-preserving edits of the cases list. Like updateScalar,
 * they refuse malformed YAML instead of masking it. A new case gets empty
 * `vars` and `expect` maps so the GUI has something to edit.
 */
export function appendCase(text: string, name: string): EditResult {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, error: `Cannot edit a file with YAML errors: ${doc.errors[0]?.message ?? 'unknown'}` };
  }
  const item = { name, vars: {}, expect: {} };
  const existing = doc.get('cases', true);
  if (existing === undefined) {
    doc.set('cases', doc.createNode([item]));
  } else if (isSeq(existing)) {
    existing.add(doc.createNode(item));
  } else {
    return { ok: false, error: '"cases" is not a list.' };
  }
  return { ok: true, text: doc.toString() };
}

export function removeCase(text: string, index: number): EditResult {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, error: `Cannot edit a file with YAML errors: ${doc.errors[0]?.message ?? 'unknown'}` };
  }
  const cases = doc.get('cases', true);
  if (!isSeq(cases) || !Number.isInteger(index) || index < 0 || index >= cases.items.length) {
    return { ok: false, error: `No case at index ${index}.` };
  }
  cases.delete(index);
  return { ok: true, text: doc.toString() };
}
```

- [ ] **Step 4: Implement `src/core/format/minimal-edit.ts`**

```ts
/** A single replacement in the OLD text; offsets are UTF-16 code units, matching VS Code's `positionAt`. */
export interface TextReplace {
  start: number;
  end: number;
  text: string;
}

const isHigh = (s: string, i: number): boolean => {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff;
};

/**
 * Smallest single replacement turning `oldText` into `newText` (common prefix
 * and suffix stripped), or undefined when they are equal. Boundaries snap
 * outward off a surrogate pair so an edit never cuts an emoji in half.
 */
export function minimalTextEdit(oldText: string, newText: string): TextReplace | undefined {
  if (oldText === newText) return undefined;
  let start = 0;
  const max = Math.min(oldText.length, newText.length);
  while (start < max && oldText.charCodeAt(start) === newText.charCodeAt(start)) start += 1;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  if (start > 0 && isHigh(oldText, start - 1)) start -= 1;
  if (oldEnd < oldText.length && isHigh(oldText, oldEnd - 1)) oldEnd += 1;
  if (newEnd < newText.length && isHigh(newText, newEnd - 1)) newEnd += 1;
  return { start, end: oldEnd, text: newText.slice(start, newEnd) };
}
```

- [ ] **Step 5: Run tests, typecheck, full suite**

Run: `npx vitest run tests/core/edit-structure.test.ts tests/core/minimal-edit.test.ts && npm test && npm run check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/format/edit-structure.ts src/core/format/minimal-edit.ts tests/core/edit-structure.test.ts tests/core/minimal-edit.test.ts
git commit -m "feat: comment-preserving case edits and minimal text replacement"
```

---

### Task 3: Protocol, document sync, run store, webview HTML (host, vscode-free)

**Files:**
- Modify: `src/shared/protocol.ts` (complete it)
- Create: `src/host/document-sync.ts`, `src/host/run-store.ts`, `src/host/webview-html.ts`
- Modify: `src/host/salvo-language.ts` (add operation-relative wrappers), `vitest.config.ts` (include `tests/shared/**`, `tests/webview/**`)
- Test: `tests/shared/protocol.test.ts`, `tests/host/document-sync.test.ts`, `tests/host/run-store.test.ts`, `tests/host/webview-html.test.ts`; add cases to `tests/host/salvo-language.test.ts`

**Interfaces:**
- Consumes: Task 1 and 2 exports, `parseSalvoFile`, `updateScalar`.
- Produces (exact):
  ```ts
  // protocol.ts
  export type FieldPath = (string | number)[];
  export type DocumentView = { ok: true; file: SalvoFile; issues: ParseIssue[] } | { ok: false; issues: ParseIssue[] };
  export type SchemaStatus = 'none' | 'loading' | 'ready' | 'failed';
  export interface EditorSnapshot { view: DocumentView; envName?: string; envNames: string[]; schema: SchemaStatus; results?: RunResult[]; running: boolean }
  export interface LangCompletion { label: string; detail?: string; documentation?: string }
  export type WebviewToHost = …; export type HostToWebview = …; export function isWebviewMessage(x: unknown): x is WebviewToHost;
  // document-sync.ts
  export type FieldEdit = { kind: 'scalar'; path: FieldPath; value: string } | { kind: 'operation'; text: string } | { kind: 'appendCase'; name: string } | { kind: 'removeCase'; index: number };
  export type ApplyResult = { ok: true; text: string; replace?: TextReplace } | { ok: false; error: string };
  export function buildDocumentView(text: string): DocumentView;
  export function coerceLike(current: unknown, raw: string): string | number | boolean;
  export function applyFieldEdit(text: string, edit: FieldEdit): ApplyResult;
  export class EchoGuard { markOwn(text: string): void; isEcho(text: string): boolean }
  // run-store.ts
  export interface RunEntry { results: RunResult[]; running: boolean }
  export function mergeResults(previous: RunResult[], fresh: RunResult[]): RunResult[];
  export class RunStore { get(key): RunEntry | undefined; setRunning(key): void; setResults(key, results): void; clear(key): void; onChange(listener: (key: string) => void): () => void }
  // webview-html.ts
  export interface WebviewAssets { scriptUri: string; styleUri: string; cspSource: string; nonce: string }
  export function buildWebviewHtml(a: WebviewAssets): string;
  // salvo-language.ts additions
  export function completionsInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): LangCompletion[];
  export function diagnosticsInOperation(schema: GraphQLSchema | undefined, text: string): LangDiagnostic[];
  export function hoverInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): string | undefined;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/shared/protocol.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isWebviewMessage } from '../../src/shared/protocol';

describe('isWebviewMessage', () => {
  it('accepts every well-formed message', () => {
    for (const m of [
      { type: 'ready' },
      { type: 'edit', path: ['request', 'url'], value: 'x' },
      { type: 'edit', path: ['cases', 0, 'vars', 'token'], value: '' },
      { type: 'editOperation', text: 'query { ok }' },
      { type: 'appendCase', name: 'n' },
      { type: 'removeCase', index: 0 },
      { type: 'run', selected: 'all' },
      { type: 'run', selected: [0, 2] },
      { type: 'selectEnvironment', name: 'dev' },
      { type: 'lang', id: 1, op: 'lint', text: 'q' },
      { type: 'lang', id: 2, op: 'complete', text: 'q', pos: { line: 0, character: 0 } },
      { type: 'lang', id: 3, op: 'hover', text: 'q', pos: { line: 1, character: 4 } },
    ]) {
      expect(isWebviewMessage(m), JSON.stringify(m)).toBe(true);
    }
  });

  it('rejects malformed, foreign, and hostile shapes', () => {
    for (const m of [
      null, 'ready', {}, { type: 'nope' },
      { type: 'edit', path: [], value: 'x' },
      { type: 'edit', path: ['a', -1], value: 'x' },
      { type: 'edit', path: ['a'], value: 1 },
      { type: 'removeCase', index: -1 },
      { type: 'removeCase', index: 1.5 },
      { type: 'run', selected: ['0'] },
      { type: 'lang', id: 'x', op: 'lint', text: 'q' },
      { type: 'lang', id: 1, op: 'complete', text: 'q' },
      { type: 'lang', id: 1, op: 'complete', text: 'q', pos: { line: -1, character: 0 } },
      { type: 'lang', id: 1, op: 'explode', text: 'q' },
    ]) {
      expect(isWebviewMessage(m), JSON.stringify(m)).toBe(false);
    }
  });
});
```

`tests/host/document-sync.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyFieldEdit, buildDocumentView, coerceLike, EchoGuard } from '../../src/host/document-sync';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

// One space before the comment on purpose: yaml re-serializes comment spacing
// to a single space, so a fixture with wider spacing would see that
// normalization folded into the first edit's range (verified 2026-09-11).
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql" # endpoint
  headers: { auth: "Bearer {{token}}" }
  operation: |
    query { ok }
  timeoutMs: 5000
cases:
  - name: one
    vars: { token: abc, retries: 2, verbose: false }
`;

const fileOf = (text: string) => {
  const p = parseSalvoFile(text);
  if (!p.ok) throw new Error('unparsable');
  return p.file;
};

describe('coerceLike', () => {
  it('keeps the type the document already has', () => {
    expect(coerceLike(5000, '7000')).toBe(7000);
    expect(coerceLike(5000, ' 8000 ')).toBe(8000);
    expect(coerceLike(5000, 'abc')).toBe('abc');
    expect(coerceLike(false, 'true')).toBe(true);
    expect(coerceLike(false, 'yes')).toBe('yes');
    expect(coerceLike('42', '43')).toBe('43');
    expect(coerceLike(null, 'x')).toBe('x');
  });
});

describe('applyFieldEdit', () => {
  it('rewrites one scalar as a minimal range edit and keeps comments', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['request', 'timeoutMs'], value: '7000' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.replace).toEqual({ start: DOC.indexOf('5000'), end: DOC.indexOf('5000') + 1, text: '7' });
    expect(r.text).toContain('# endpoint');
    expect(fileOf(r.text).request.timeoutMs).toBe(7000);
  });

  it('coerces case vars by their current type', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['cases', 0, 'vars', 'verbose'], value: 'true' });
    expect(r.ok && fileOf(r.text).cases?.[0]?.vars?.['verbose']).toBe(true);
  });

  it('is a no-op without a replacement when the value is unchanged', () => {
    const r = applyFieldEdit(DOC, { kind: 'scalar', path: ['request', 'url'], value: 'http://x.test/graphql' });
    expect(r).toEqual({ ok: true, text: DOC });
  });

  it('keeps the | block style when the new operation lacks a trailing newline', () => {
    const r = applyFieldEdit(DOC, { kind: 'operation', text: 'query { me { id } }' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('operation: |\n    query { me { id } }\n');
    expect(r.text).not.toContain('|-');
    expect(fileOf(r.text).request.operation).toBe('query { me { id } }\n');
  });

  it('routes structural edits', () => {
    const added = applyFieldEdit(DOC, { kind: 'appendCase', name: 'two' });
    expect(added.ok && fileOf(added.text).cases?.map((c) => c.name)).toEqual(['one', 'two']);
    const removed = applyFieldEdit(DOC, { kind: 'removeCase', index: 0 });
    expect(removed.ok && fileOf(removed.text).cases).toEqual([]);
  });

  it('refuses to edit a document that does not parse', () => {
    const r = applyFieldEdit('salvo: 1\nrequest: [unclosed', { kind: 'scalar', path: ['request', 'url'], value: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Fix the errors');
  });
});

describe('buildDocumentView', () => {
  it('wraps parse success and failure', () => {
    expect(buildDocumentView(DOC).ok).toBe(true);
    const broken = buildDocumentView('salvo: 1\n');
    expect(broken.ok).toBe(false);
    expect(broken.issues.length).toBeGreaterThan(0);
  });
});

describe('EchoGuard', () => {
  it('matches the marked text exactly once and treats anything else as foreign', () => {
    const g = new EchoGuard();
    g.markOwn('A');
    expect(g.isEcho('A')).toBe(true);
    expect(g.isEcho('A')).toBe(false);
    g.markOwn('A');
    expect(g.isEcho('B')).toBe(false);
    expect(g.isEcho('A')).toBe(false);
  });
});
```

`tests/host/run-store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeResults, RunStore } from '../../src/host/run-store';
import type { RunResult } from '../../src/core/types';

const res = (i: number, outcome: RunResult['outcome'] = 'passed'): RunResult => ({ caseIndex: i, caseName: `c${i}`, outcome, assertions: [] });

describe('mergeResults', () => {
  it('replaces results for re-run cases and keeps the rest sorted by index', () => {
    expect(mergeResults([res(0), res(1, 'failed'), res(2)], [res(1)])).toEqual([res(0), res(1), res(2)]);
    expect(mergeResults([], [res(3), res(1)])).toEqual([res(1), res(3)]);
  });
});

describe('RunStore', () => {
  it('tracks running and results per key and notifies listeners', () => {
    const store = new RunStore();
    const seen: string[] = [];
    const off = store.onChange((k) => seen.push(k));
    store.setRunning('a');
    expect(store.get('a')).toEqual({ results: [], running: true });
    store.setResults('a', [res(0)]);
    expect(store.get('a')).toEqual({ results: [res(0)], running: false });
    store.setRunning('a');
    expect(store.get('a')?.results).toEqual([res(0)]);
    off();
    store.clear('a');
    expect(store.get('a')).toBeUndefined();
    expect(seen).toEqual(['a', 'a', 'a']);
  });
});
```

`tests/host/webview-html.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildWebviewHtml } from '../../src/host/webview-html';

describe('buildWebviewHtml', () => {
  const html = buildWebviewHtml({
    scriptUri: 'https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.js',
    styleUri: 'https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.css',
    cspSource: 'https://*.vscode-cdn.net',
    nonce: 'N0nce+/=',
  });

  it('locks the CSP down to the nonce and the webview origin', () => {
    expect(html).toContain(
      `content="default-src 'none'; img-src https://*.vscode-cdn.net; style-src https://*.vscode-cdn.net 'nonce-N0nce+/='; script-src 'nonce-N0nce+/='; font-src https://*.vscode-cdn.net"`
    );
    expect(html).not.toContain('unsafe-inline');
    expect(html).not.toContain('unsafe-eval');
  });

  it('loads the bundle with the nonce and exposes it to the page', () => {
    expect(html).toContain('<script nonce="N0nce+/=" data-nonce="N0nce+/=" src="https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="https://file+.vscode-resource.vscode-cdn.net/x/dist/webview.css">');
    expect(html).toContain('<div id="root"></div>');
  });

  it('escapes attribute characters in URIs', () => {
    expect(buildWebviewHtml({ scriptUri: 'a"b<c', styleUri: 's', cspSource: 'c', nonce: 'n' })).toContain('src="a&quot;b&lt;c"');
  });
});
```

Append to `tests/host/salvo-language.test.ts` (extend the import with `completionsInOperation, diagnosticsInOperation, hoverInOperation`):
```ts
describe('operation-relative language ops', () => {
  const text = 'query Bad {\n  me { nope }\n}\n';
  it('serves completions, diagnostics, and hover in text coordinates', () => {
    expect(completionsInOperation(schema, text, { line: 1, character: 7 }).map((c) => c.label)).toContain('id');
    expect(diagnosticsInOperation(schema, text)).toEqual([
      expect.objectContaining({ start: { line: 1, character: 7 }, end: { line: 1, character: 12 }, severity: 'error' }),
    ]);
    expect(hoverInOperation(schema, text, { line: 1, character: 3 })).toBe('Query.me: User');
  });
  it('stays quiet without a schema', () => {
    expect(completionsInOperation(undefined, text, { line: 1, character: 7 })).toEqual([]);
    expect(diagnosticsInOperation(undefined, text)).toEqual([]);
    expect(hoverInOperation(undefined, text, { line: 1, character: 3 })).toBeUndefined();
  });
});
```

In `vitest.config.ts`, change the include to:
```ts
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/host/**/*.test.ts', 'tests/shared/**/*.test.ts', 'tests/webview/**/*.test.ts'],
    environment: 'node',
  },
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/shared tests/host/document-sync.test.ts tests/host/run-store.test.ts tests/host/webview-html.test.ts tests/host/salvo-language.test.ts`
Expected: FAIL (missing exports / modules).

- [ ] **Step 3: Complete `src/shared/protocol.ts`**

Replace the file with (keeps Task 1's two types):
```ts
import type { SalvoFile } from '../core/generated/salvo-file';
import type { ParseIssue, RunResult } from '../core/types';

/**
 * Types shared by the extension host, the core, and the webview. This file
 * must stay dependency-free: the webview bundle imports it, and the purity
 * guard forbids anything but type imports here.
 */

/** 0-based position inside an operation text (CodeMirror's coordinate space). */
export interface TextPosition {
  line: number;
  character: number;
}

export interface LangDiagnostic {
  message: string;
  start: TextPosition;
  end: TextPosition;
  severity: 'error' | 'warning';
}

export interface LangCompletion {
  label: string;
  detail?: string;
  documentation?: string;
}

/** Path into the parsed file, e.g. ['cases', 0, 'vars', 'token']. */
export type FieldPath = (string | number)[];

export type DocumentView =
  | { ok: true; file: SalvoFile; issues: ParseIssue[] }
  | { ok: false; issues: ParseIssue[] };

export type SchemaStatus = 'none' | 'loading' | 'ready' | 'failed';

/** Everything the webview renders. The host pushes a whole snapshot on every change (decision 8: the webview owns nothing). */
export interface EditorSnapshot {
  view: DocumentView;
  envName?: string;
  envNames: string[];
  schema: SchemaStatus;
  results?: RunResult[];
  running: boolean;
}

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'edit'; path: FieldPath; value: string }
  | { type: 'editOperation'; text: string }
  | { type: 'appendCase'; name: string }
  | { type: 'removeCase'; index: number }
  | { type: 'run'; selected: number[] | 'all' }
  | { type: 'selectEnvironment'; name: string }
  | { type: 'lang'; id: number; op: 'complete' | 'hover'; text: string; pos: TextPosition }
  | { type: 'lang'; id: number; op: 'lint'; text: string };

export type HostToWebview =
  | { type: 'state'; snapshot: EditorSnapshot }
  | { type: 'langResult'; id: number; op: 'complete'; items: LangCompletion[] }
  | { type: 'langResult'; id: number; op: 'lint'; items: LangDiagnostic[] }
  | { type: 'langResult'; id: number; op: 'hover'; text?: string }
  | { type: 'notice'; level: 'error' | 'info'; message: string };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isIndex = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isPos = (x: unknown): x is TextPosition => isRecord(x) && isIndex(x['line']) && isIndex(x['character']);
const isPath = (x: unknown): x is FieldPath =>
  Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === 'string' || isIndex(s));

/** The webview is untrusted input: validate shape before acting on a message. */
export function isWebviewMessage(x: unknown): x is WebviewToHost {
  if (!isRecord(x) || typeof x['type'] !== 'string') return false;
  switch (x['type']) {
    case 'ready':
      return true;
    case 'edit':
      return isPath(x['path']) && typeof x['value'] === 'string';
    case 'editOperation':
      return typeof x['text'] === 'string';
    case 'appendCase':
    case 'selectEnvironment':
      return typeof x['name'] === 'string';
    case 'removeCase':
      return isIndex(x['index']);
    case 'run':
      return x['selected'] === 'all' || (Array.isArray(x['selected']) && x['selected'].every(isIndex));
    case 'lang': {
      if (!Number.isInteger(x['id']) || typeof x['text'] !== 'string') return false;
      if (x['op'] === 'lint') return true;
      return (x['op'] === 'complete' || x['op'] === 'hover') && isPos(x['pos']);
    }
    default:
      return false;
  }
}
```

- [ ] **Step 4: Implement `src/host/document-sync.ts`**

```ts
import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { updateScalar } from '../core/format/update-scalar';
import { appendCase, removeCase } from '../core/format/edit-structure';
import { minimalTextEdit, type TextReplace } from '../core/format/minimal-edit';
import type { DocumentView, FieldPath } from '../shared/protocol';

export type FieldEdit =
  | { kind: 'scalar'; path: FieldPath; value: string }
  | { kind: 'operation'; text: string }
  | { kind: 'appendCase'; name: string }
  | { kind: 'removeCase'; index: number };

export type ApplyResult = { ok: true; text: string; replace?: TextReplace } | { ok: false; error: string };

const UNPARSABLE = 'Fix the errors in the file before editing it here.';

export function buildDocumentView(text: string): DocumentView {
  const parsed = parseSalvoFile(text);
  return parsed.ok ? { ok: true, file: parsed.file, issues: parsed.issues } : { ok: false, issues: parsed.issues };
}

/** Form fields arrive as strings; keep the type the document already has (updateScalar compares strictly). */
export function coerceLike(current: unknown, raw: string): string | number | boolean {
  if (typeof current === 'number') {
    const trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  if (typeof current === 'boolean' && (raw === 'true' || raw === 'false')) return raw === 'true';
  return raw;
}

function valueAt(root: unknown, path: FieldPath): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function nextText(text: string, edit: FieldEdit): { ok: true; text: string } | { ok: false; error: string } {
  switch (edit.kind) {
    case 'scalar': {
      const parsed = parseSalvoFile(text);
      if (!parsed.ok) return { ok: false, error: UNPARSABLE };
      return updateScalar(text, edit.path, coerceLike(valueAt(parsed.file, edit.path), edit.value));
    }
    case 'operation': {
      const parsed = parseSalvoFile(text);
      if (!parsed.ok) return { ok: false, error: UNPARSABLE };
      // A clip-chomped block ('|') ends with '\n'; keep it so the style survives the rewrite (decision 9.5).
      const current = parsed.file.request.operation;
      const value = current.endsWith('\n') && !edit.text.endsWith('\n') ? `${edit.text}\n` : edit.text;
      return updateScalar(text, ['request', 'operation'], value);
    }
    case 'appendCase':
      return appendCase(text, edit.name);
    case 'removeCase':
      return removeCase(text, edit.index);
  }
}

/**
 * New text plus the smallest range replacement that produces it (decision
 * 9.1); `replace` is absent for a no-op. The range is minimal against yaml's
 * re-serialization, which normalizes comment spacing to one space: a file
 * with wider spacing sees that folded into its first edit, once.
 */
export function applyFieldEdit(text: string, edit: FieldEdit): ApplyResult {
  const next = nextText(text, edit);
  if (!next.ok) return next;
  const replace = minimalTextEdit(text, next.text);
  return replace ? { ok: true, text: next.text, replace } : { ok: true, text };
}

/** Suppresses the change event our own WorkspaceEdit produces (decision 9.2). Text equality, not counters: it cannot drift. */
export class EchoGuard {
  private pending: string | undefined;

  markOwn(text: string): void {
    this.pending = text;
  }

  /** True exactly once for the text we last wrote; any other text is a foreign change and clears the mark. */
  isEcho(text: string): boolean {
    const match = this.pending !== undefined && this.pending === text;
    this.pending = undefined;
    return match;
  }
}
```

- [ ] **Step 5: Implement `src/host/run-store.ts`**

```ts
import type { RunResult } from '../core/types';

export interface RunEntry {
  results: RunResult[];
  running: boolean;
}

/** Results for re-run cases replace their predecessors; everything else survives, ordered by case index. */
export function mergeResults(previous: RunResult[], fresh: RunResult[]): RunResult[] {
  const replaced = new Set(fresh.map((r) => r.caseIndex));
  return [...previous.filter((r) => !replaced.has(r.caseIndex)), ...fresh].sort((a, b) => a.caseIndex - b.caseIndex);
}

/** Host-owned run state (decision 8): outlives any webview, keyed by document URI string. */
export class RunStore {
  private readonly entries = new Map<string, RunEntry>();
  private readonly listeners = new Set<(key: string) => void>();

  get(key: string): RunEntry | undefined {
    return this.entries.get(key);
  }

  setRunning(key: string): void {
    this.entries.set(key, { results: this.entries.get(key)?.results ?? [], running: true });
    this.emit(key);
  }

  setResults(key: string, results: RunResult[]): void {
    this.entries.set(key, { results, running: false });
    this.emit(key);
  }

  clear(key: string): void {
    this.entries.delete(key);
    this.emit(key);
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(key: string): void {
    for (const l of this.listeners) l(key);
  }
}
```

- [ ] **Step 6: Implement `src/host/webview-html.ts`**

```ts
export interface WebviewAssets {
  scriptUri: string;
  styleUri: string;
  cspSource: string;
  nonce: string;
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The editor's HTML shell. CSP allows exactly our bundle (by nonce), our
 * stylesheet (by origin), and CodeMirror's injected styles (by the same
 * nonce, handed to `EditorView.cspNonce` through `data-nonce`). Nothing
 * inline, nothing eval'd, nothing fetched.
 */
export function buildWebviewHtml(a: WebviewAssets): string {
  const csp = [
    "default-src 'none'",
    `img-src ${a.cspSource}`,
    `style-src ${a.cspSource} 'nonce-${a.nonce}'`,
    `script-src 'nonce-${a.nonce}'`,
    `font-src ${a.cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${escapeAttr(a.styleUri)}">
<title>Salvo</title>
</head>
<body>
<div id="root"></div>
<script nonce="${a.nonce}" data-nonce="${a.nonce}" src="${escapeAttr(a.scriptUri)}"></script>
</body>
</html>`;
}
```

- [ ] **Step 7: Add operation-relative wrappers to `src/host/salvo-language.ts`**

Extend the import from `../core/lang/graphql-language` with `getCompletionsInText, getDiagnosticsInText, getHoverInText`, add `import type { LangCompletion, LangDiagnostic, TextPosition } from '../shared/protocol';`, and append:
```ts
/** Language ops in operation-text coordinates, for the visual editor. All three stay quiet without a schema. */
export function completionsInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): LangCompletion[] {
  if (!schema) return [];
  return getCompletionsInText(schema, text, pos).map((c) => ({
    label: c.label,
    ...(c.detail !== undefined ? { detail: c.detail } : {}),
    ...(typeof c.documentation === 'string' ? { documentation: c.documentation } : {}),
  }));
}

export function diagnosticsInOperation(schema: GraphQLSchema | undefined, text: string): LangDiagnostic[] {
  return schema ? getDiagnosticsInText(schema, text) : [];
}

export function hoverInOperation(schema: GraphQLSchema | undefined, text: string, pos: TextPosition): string | undefined {
  return schema ? getHoverInText(schema, text, pos) : undefined;
}
```

- [ ] **Step 8: Run tests, typecheck, full suite**

Run: `npx vitest run tests/shared tests/host && npm test && npm run check`
Expected: all green; the suite count now includes `tests/shared`.

- [ ] **Step 9: Commit**

```bash
git add src/shared/protocol.ts src/host/document-sync.ts src/host/run-store.ts src/host/webview-html.ts src/host/salvo-language.ts vitest.config.ts tests/shared/protocol.test.ts tests/host/document-sync.test.ts tests/host/run-store.test.ts tests/host/webview-html.test.ts tests/host/salvo-language.test.ts
git commit -m "feat: editor protocol, document sync, run store, and CSP-locked webview shell"
```

---

### Task 4: Webview app (build, state, bridge, React shell) and the widened purity guard

The React shell renders the snapshot, edits scalars, adds/removes cases, runs, and shows results. The operation editor is a plain `<textarea>` in this task; Task 5 swaps in CodeMirror behind the same props.

**Files:**
- Create: `tsconfig.webview.json`, `src/webview/vscode-api.d.ts`, `src/webview/bridge.ts`, `src/webview/state.ts`, `src/webview/main.tsx`, `src/webview/App.tsx`, `src/webview/RequestPanel.tsx`, `src/webview/CasesPanel.tsx`, `src/webview/ResultsPanel.tsx`, `src/webview/ScalarField.tsx`, `src/webview/OperationEditor.tsx`, `src/webview/styles.css`
- Modify: `esbuild.mjs`, `package.json` (deps + `check` script), `tsconfig.json` (exclude `src/webview`), `.vscodeignore` (add `tsconfig.webview.json`)
- Test: `tests/webview/state.test.ts`, `tests/webview/bridge.test.ts`, `tests/core/module-purity.test.ts` (new). The existing `tests/core/no-vscode-import.test.ts` stays untouched: existing tests are never modified, only added to (ruling 2026-10-02).

**Interfaces:**
- Consumes: `protocol.ts` types.
- Produces (Task 5 and 6 rely on these):
  ```ts
  // bridge.ts
  export class Bridge { constructor(post: (msg: WebviewToHost) => void); send(msg: WebviewToHost): void; complete(text, pos): Promise<LangCompletion[]>; lint(text): Promise<LangDiagnostic[]>; hover(text, pos): Promise<string | undefined>; receive(msg: HostToWebview): boolean }
  // state.ts
  export interface WebviewState { snapshot?: EditorSnapshot; lastGood?: Extract<DocumentView, { ok: true }>; banner?: string; notice?: { level: 'error' | 'info'; message: string }; selectedCase: number }
  export const initialState: WebviewState; export function reduce(s, msg: HostToWebview): WebviewState; export function selectCase(s, i): WebviewState; export function dismissNotice(s): WebviewState; export function modelOf(s): Extract<DocumentView, { ok: true }> | undefined;
  // OperationEditor.tsx
  export interface OperationEditorProps { text: string; bridge: Bridge; nonce: string; schemaReady: boolean; onCommit: (text: string) => void }
  ```
  Build outputs: `dist/webview.js`, `dist/webview.css` (esbuild emits the CSS imported from `main.tsx`).

- [ ] **Step 1: Install deps, add configs**

Run: `npm install react@19.2.8 react-dom@19.2.8 --no-audit --no-fund && npm install -D @types/react@19.2.18 @types/react-dom@19.2.7 --no-audit --no-fund`

`tsconfig.webview.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": [],
    "noEmit": true
  },
  "include": ["src/webview", "src/shared"]
}
```
(`"types": []` keeps Node globals out of the webview typecheck: a stray `Buffer` or `process` fails `npm run check`.)

In root `tsconfig.json`, change exclude to `"exclude": ["tests/vscode", "src/webview", "out", "out-test", "dist"]` (pure webview modules that tests import still compile because TypeScript follows imports; only the DOM-bound files stay out).

`package.json` script: `"check": "tsc --noEmit && tsc -p tsconfig.webview.json"`.

`.vscodeignore`: append `tsconfig.webview.json`.

`esbuild.mjs` (replace the file):
```js
import { build } from 'esbuild';

const host = build({
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

const webview = build({
  entryPoints: ['src/webview/main.tsx'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  jsx: 'automatic',
  // React's CJS entry switches on this; folding it selects the production build.
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  logLevel: 'info',
});

await Promise.all([host, webview]);
```

- [ ] **Step 2: Write the failing tests**

`tests/webview/state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dismissNotice, initialState, modelOf, reduce, selectCase } from '../../src/webview/state';
import type { EditorSnapshot } from '../../src/shared/protocol';

const good: EditorSnapshot = {
  view: { ok: true, file: { salvo: 1, request: { url: 'u', operation: 'q' }, cases: [{ name: 'a' }, { name: 'b' }] }, issues: [] },
  envNames: ['dev'],
  envName: 'dev',
  schema: 'ready',
  running: false,
};
const broken: EditorSnapshot = { ...good, view: { ok: false, issues: [{ message: 'bad indent', line: 4, col: 1, severity: 'error' }] } };

describe('webview state', () => {
  it('adopts a parsed snapshot as the last good model', () => {
    const s = reduce(initialState, { type: 'state', snapshot: good });
    expect(modelOf(s)?.file.cases?.length).toBe(2);
    expect(s.banner).toBeUndefined();
  });

  it('keeps the last good model and raises a banner while the text is broken', () => {
    const s = reduce(reduce(initialState, { type: 'state', snapshot: good }), { type: 'state', snapshot: broken });
    expect(s.banner).toBe('Line 4: bad indent');
    expect(modelOf(s)?.file.cases?.length).toBe(2);
    expect(s.snapshot?.view.ok).toBe(false);
  });

  it('clamps the selected case when cases disappear', () => {
    const s = selectCase(reduce(initialState, { type: 'state', snapshot: good }), 1);
    const fewer: EditorSnapshot = { ...good, view: { ok: true, file: { salvo: 1, request: { url: 'u', operation: 'q' }, cases: [{ name: 'a' }] }, issues: [] } };
    expect(reduce(s, { type: 'state', snapshot: fewer }).selectedCase).toBe(0);
  });

  it('stores and dismisses notices and ignores language replies', () => {
    const s = reduce(initialState, { type: 'notice', level: 'error', message: 'nope' });
    expect(s.notice).toEqual({ level: 'error', message: 'nope' });
    expect(dismissNotice(s).notice).toBeUndefined();
    expect(reduce(s, { type: 'langResult', id: 1, op: 'lint', items: [] })).toBe(s);
  });
});
```

`tests/webview/bridge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Bridge } from '../../src/webview/bridge';
import type { WebviewToHost } from '../../src/shared/protocol';

describe('Bridge', () => {
  it('correlates language requests with replies by id', async () => {
    const sent: WebviewToHost[] = [];
    const b = new Bridge((m) => sent.push(m));
    const p1 = b.complete('q', { line: 0, character: 0 });
    const p2 = b.hover('q', { line: 0, character: 1 });
    const [m1, m2] = sent;
    if (m1?.type !== 'lang' || m2?.type !== 'lang') throw new Error('expected lang messages');
    expect(b.receive({ type: 'langResult', id: m2.id, op: 'hover', text: 'T' })).toBe(true);
    expect(b.receive({ type: 'langResult', id: m1.id, op: 'complete', items: [{ label: 'id' }] })).toBe(true);
    expect(await p1).toEqual([{ label: 'id' }]);
    expect(await p2).toBe('T');
  });

  it('passes non-replies through and tolerates unknown or mismatched replies', async () => {
    const b = new Bridge(() => undefined);
    expect(b.receive({ type: 'notice', level: 'info', message: 'x' })).toBe(false);
    expect(b.receive({ type: 'langResult', id: 99, op: 'lint', items: [] })).toBe(true);
    const p = b.lint('q');
    expect(b.receive({ type: 'langResult', id: 1, op: 'hover', text: 'wrong op' })).toBe(true);
    expect(await p).toEqual([]);
  });
});
```

Create `tests/core/module-purity.test.ts` (leave `tests/core/no-vscode-import.test.ts` exactly as it is; its core/host check stays as a second net):
```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const VSCODE_FREE = ['../../src/core', '../../src/host', '../../src/shared', '../../src/webview'].map(dir);
const BROWSER_ONLY = ['../../src/shared', '../../src/webview'].map(dir);

function walk(d: string): string[] {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const scan = (dirs: string[], check: (file: string, src: string) => void): void => {
  const present = dirs.filter((d) => existsSync(d));
  expect(present.length, 'no guarded directories found').toBe(dirs.length);
  for (const d of present) {
    const files = walk(d);
    expect(files.length, `${d} has no files to scan`).toBeGreaterThan(0);
    for (const f of files) check(f, readFileSync(f, 'utf8'));
  }
};

describe('module purity', () => {
  it('core, host, shared, and webview never reference the vscode module', () => {
    // Any 'vscode' module string: static/side-effect/dynamic import and require alike.
    scan(VSCODE_FREE, (f, src) => expect(src, `${f} references the vscode module`).not.toMatch(/['"]vscode['"]/));
  });

  it('shared and webview stay browser-only: no node, no parsers, no core/host values, no inline styles', () => {
    scan(BROWSER_ONLY, (f, src) => {
      expect(src, `${f} imports a node builtin`).not.toMatch(/from\s+['"]node:/);
      expect(src, `${f} imports a host-only package`).not.toMatch(/from\s+['"](yaml|ajv|graphql|graphql-language-service)['"]/);
      for (const line of src.split('\n')) {
        if (/from\s+['"]\.\.\/(core|host)\//.test(line) || /from\s+['"]\.\.\/\.\.\/(core|host)\//.test(line)) {
          expect(line.trimStart(), `${f} imports a value from core/host: ${line.trim()}`).toMatch(/^import type /);
        }
      }
      if (f.endsWith('.tsx')) expect(src, `${f} uses an inline style prop (blocked by CSP)`).not.toContain('style={{');
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/webview tests/core/no-vscode-import.test.ts`
Expected: FAIL (modules not found; `src/shared` exists but `src/webview` does not yet, so the guard's "all guarded directories present" assertion fails).

- [ ] **Step 4: Write the pure webview modules**

`src/webview/vscode-api.d.ts`:
```ts
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

// esbuild bundles the stylesheet imported from main.tsx; TypeScript only needs to accept the import.
declare module '*.css';
```

`src/webview/bridge.ts`:
```ts
import type { HostToWebview, LangCompletion, LangDiagnostic, TextPosition, WebviewToHost } from '../shared/protocol';

type Pending =
  | { op: 'complete'; resolve: (items: LangCompletion[]) => void }
  | { op: 'lint'; resolve: (items: LangDiagnostic[]) => void }
  | { op: 'hover'; resolve: (text: string | undefined) => void };

/** Sends intents to the host and correlates language requests with their replies. Pure: takes the `post` function. */
export class Bridge {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly post: (msg: WebviewToHost) => void) {}

  send(msg: WebviewToHost): void {
    this.post(msg);
  }

  complete(text: string, pos: TextPosition): Promise<LangCompletion[]> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'complete', resolve });
      this.post({ type: 'lang', id, op: 'complete', text, pos });
    });
  }

  lint(text: string): Promise<LangDiagnostic[]> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'lint', resolve });
      this.post({ type: 'lang', id, op: 'lint', text });
    });
  }

  hover(text: string, pos: TextPosition): Promise<string | undefined> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'hover', resolve });
      this.post({ type: 'lang', id, op: 'hover', text, pos });
    });
  }

  /** Feed every host message here; true means it was a reply this bridge consumed. */
  receive(msg: HostToWebview): boolean {
    if (msg.type !== 'langResult') return false;
    const p = this.pending.get(msg.id);
    if (!p) return true;
    this.pending.delete(msg.id);
    if (p.op === 'complete' && msg.op === 'complete') p.resolve(msg.items);
    else if (p.op === 'lint' && msg.op === 'lint') p.resolve(msg.items);
    else if (p.op === 'hover' && msg.op === 'hover') p.resolve(msg.text);
    // A mismatched op is a host bug; resolve empty so the editor never hangs on it.
    else if (p.op === 'hover') p.resolve(undefined);
    else p.resolve([]);
    return true;
  }
}
```

`src/webview/state.ts`:
```ts
import type { DocumentView, EditorSnapshot, HostToWebview } from '../shared/protocol';

export type GoodView = Extract<DocumentView, { ok: true }>;

export interface WebviewState {
  snapshot?: EditorSnapshot;
  /** Last snapshot whose document parsed; rendered while the text is mid-edit and broken (decision 9.3). */
  lastGood?: GoodView;
  banner?: string;
  notice?: { level: 'error' | 'info'; message: string };
  selectedCase: number;
}

export const initialState: WebviewState = { selectedCase: 0 };

export function reduce(state: WebviewState, msg: HostToWebview): WebviewState {
  switch (msg.type) {
    case 'state': {
      const { view } = msg.snapshot;
      if (view.ok) {
        const count = view.file.cases?.length ?? 0;
        return {
          ...state,
          snapshot: msg.snapshot,
          lastGood: view,
          banner: undefined,
          selectedCase: Math.min(state.selectedCase, Math.max(0, count - 1)),
        };
      }
      const first = view.issues[0];
      return { ...state, snapshot: msg.snapshot, banner: first ? `Line ${first.line}: ${first.message}` : 'The file cannot be parsed.' };
    }
    case 'notice':
      return { ...state, notice: { level: msg.level, message: msg.message } };
    case 'langResult':
      return state;
  }
}

export function selectCase(state: WebviewState, index: number): WebviewState {
  return { ...state, selectedCase: index };
}

export function dismissNotice(state: WebviewState): WebviewState {
  return { ...state, notice: undefined };
}

/** What the panels render: the live model when it parses, else the last good one. */
export function modelOf(state: WebviewState): GoodView | undefined {
  const view = state.snapshot?.view;
  return view?.ok ? view : state.lastGood;
}
```

- [ ] **Step 5: Run the pure tests**

Run: `npx vitest run tests/webview`
Expected: PASS for state and bridge (the purity guard still fails until the components exist).

- [ ] **Step 6: Write the React shell**

`src/webview/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Bridge } from './bridge';
import './styles.css';

const vscode = acquireVsCodeApi();
const bridge = new Bridge((m) => vscode.postMessage(m));
// The host stamps the CSP nonce on our script tag; CodeMirror needs it for its injected styles.
const nonce = (document.currentScript as HTMLScriptElement | null)?.dataset['nonce'] ?? '';
const root = document.getElementById('root');
if (root) createRoot(root).render(<App bridge={bridge} nonce={nonce} />);
```

`src/webview/App.tsx`:
```tsx
import { useEffect, useReducer } from 'react';
import type { HostToWebview } from '../shared/protocol';
import type { Bridge } from './bridge';
import { dismissNotice, initialState, modelOf, reduce, selectCase, type WebviewState } from './state';
import { RequestPanel } from './RequestPanel';
import { CasesPanel } from './CasesPanel';
import { ResultsPanel } from './ResultsPanel';

type Action = { kind: 'host'; msg: HostToWebview } | { kind: 'select'; index: number } | { kind: 'dismiss' };

const reducer = (s: WebviewState, a: Action): WebviewState =>
  a.kind === 'host' ? reduce(s, a.msg) : a.kind === 'select' ? selectCase(s, a.index) : dismissNotice(s);

export function App({ bridge, nonce }: { bridge: Bridge; nonce: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => {
      if (!bridge.receive(e.data)) dispatch({ kind: 'host', msg: e.data });
    };
    window.addEventListener('message', onMessage);
    // Pull the full state only once the listener exists, so the reply cannot
    // arrive before anyone hears it. Runs on first load and on every re-show,
    // because a hidden webview is destroyed and rebuilt (decision 8).
    bridge.send({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [bridge]);

  const snap = state.snapshot;
  const model = modelOf(state);
  if (!snap) return <div className="empty">Loading…</div>;

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Salvo</span>
        <label className="env">
          Environment
          <select
            value={snap.envName ?? ''}
            disabled={snap.envNames.length === 0}
            onChange={(e) => bridge.send({ type: 'selectEnvironment', name: e.target.value })}
          >
            {snap.envNames.length === 0 ? <option value="">none</option> : snap.envNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className={`schema schema-${snap.schema}`}>schema: {snap.schema}</span>
        <button className="primary" disabled={snap.running || !model} onClick={() => bridge.send({ type: 'run', selected: 'all' })}>
          {snap.running ? 'Running…' : 'Run all cases'}
        </button>
      </header>
      {state.banner && <div className="banner error">{state.banner} The last valid version is shown until the file parses again.</div>}
      {state.notice && (
        <div className={`banner ${state.notice.level}`} onClick={() => dispatch({ kind: 'dismiss' })}>
          {state.notice.message}
        </div>
      )}
      {model ? (
        <main className="panels">
          <RequestPanel model={model} bridge={bridge} nonce={nonce} schemaReady={snap.schema === 'ready'} />
          <CasesPanel
            model={model}
            bridge={bridge}
            selected={state.selectedCase}
            onSelect={(i) => dispatch({ kind: 'select', index: i })}
            results={snap.results}
            running={snap.running}
          />
          <ResultsPanel results={snap.results} selected={state.selectedCase} />
        </main>
      ) : (
        <div className="empty">Open the file as text to fix the errors above.</div>
      )}
    </div>
  );
}
```

`src/webview/ScalarField.tsx`:
```tsx
import { useEffect, useState } from 'react';

/** Text input that commits on blur or Enter, and follows external changes to `value` (no echo loops). */
export function ScalarField({ label, value, onCommit }: { label: string; value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}
```

`src/webview/OperationEditor.tsx` (textarea version; Task 5 replaces the body, not the props):
```tsx
import { useEffect, useState } from 'react';
import type { Bridge } from './bridge';

export interface OperationEditorProps {
  text: string;
  bridge: Bridge;
  nonce: string;
  schemaReady: boolean;
  onCommit: (text: string) => void;
}

/** Plain textarea; commits on blur when the text changed. Task 5 replaces this with CodeMirror behind the same props. */
export function OperationEditor({ text, onCommit }: OperationEditorProps) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <textarea
      className="operation"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== text) onCommit(draft);
      }}
    />
  );
}
```

`src/webview/RequestPanel.tsx`:
```tsx
import type { Bridge } from './bridge';
import type { GoodView } from './state';
import { ScalarField } from './ScalarField';
import { OperationEditor } from './OperationEditor';

export function RequestPanel({ model, bridge, nonce, schemaReady }: { model: GoodView; bridge: Bridge; nonce: string; schemaReady: boolean }) {
  const req = model.file.request;
  const headers = Object.entries(req.headers ?? {});
  return (
    <section className="panel request">
      <h2>Request</h2>
      <ScalarField label="URL" value={req.url} onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'url'], value: v })} />
      {headers.length > 0 && (
        <div className="headers">
          <h3>Headers</h3>
          {headers.map(([name, value]) => (
            <ScalarField key={name} label={name} value={value} onCommit={(v) => bridge.send({ type: 'edit', path: ['request', 'headers', name], value: v })} />
          ))}
        </div>
      )}
      <h3>
        Operation {schemaReady ? null : <span className="muted">(no schema: completions and checks are off)</span>}
      </h3>
      <OperationEditor
        text={req.operation}
        bridge={bridge}
        nonce={nonce}
        schemaReady={schemaReady}
        onCommit={(t) => bridge.send({ type: 'editOperation', text: t })}
      />
    </section>
  );
}
```

`src/webview/CasesPanel.tsx`:
```tsx
import type { RunResult } from '../core/types';
import type { Bridge } from './bridge';
import type { GoodView } from './state';
import { ScalarField } from './ScalarField';

export function CasesPanel({
  model,
  bridge,
  selected,
  onSelect,
  results,
  running,
}: {
  model: GoodView;
  bridge: Bridge;
  selected: number;
  onSelect: (index: number) => void;
  results: RunResult[] | undefined;
  running: boolean;
}) {
  const cases = model.file.cases ?? [];
  const kase = cases[selected];
  const outcomeOf = (i: number) => results?.find((r) => r.caseIndex === i)?.outcome ?? 'none';
  return (
    <section className="panel cases">
      <h2>Cases</h2>
      <ul className="case-list">
        {cases.map((c, i) => (
          <li key={i} className={i === selected ? 'selected' : ''}>
            <button className="case-row" onClick={() => onSelect(i)}>
              <span className={`dot ${outcomeOf(i)}`} />
              {c.name}
            </button>
            <button className="icon" title="Run this case" disabled={running} onClick={() => bridge.send({ type: 'run', selected: [i] })}>
              ▶
            </button>
            <button className="icon" title="Remove this case" onClick={() => bridge.send({ type: 'removeCase', index: i })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-case"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = String(new FormData(form).get('name') ?? '').trim();
          if (name) {
            bridge.send({ type: 'appendCase', name });
            form.reset();
          }
        }}
      >
        <input name="name" placeholder="New case name" />
        <button type="submit">Add case</button>
      </form>
      {kase && (
        <div className="case-detail">
          <ScalarField label="Name" value={kase.name} onCommit={(v) => bridge.send({ type: 'edit', path: ['cases', selected, 'name'], value: v })} />
          {Object.entries(kase.vars ?? {}).map(([k, v]) => (
            <ScalarField
              key={k}
              label={`vars.${k}`}
              value={v === null ? '' : String(v)}
              onCommit={(nv) => bridge.send({ type: 'edit', path: ['cases', selected, 'vars', k], value: nv })}
            />
          ))}
          <details>
            <summary>expect</summary>
            <pre>{JSON.stringify(kase.expect ?? {}, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
```

`src/webview/ResultsPanel.tsx`:
```tsx
import type { RunResult } from '../core/types';

export function ResultsPanel({ results, selected }: { results: RunResult[] | undefined; selected: number }) {
  const r = results?.find((x) => x.caseIndex === selected);
  if (!results) {
    return (
      <section className="panel results">
        <h2>Response</h2>
        <p className="muted">Run the cases to see responses here.</p>
      </section>
    );
  }
  if (!r) {
    return (
      <section className="panel results">
        <h2>Response</h2>
        <p className="muted">This case was not part of the last run.</p>
      </section>
    );
  }
  return (
    <section className="panel results">
      <h2>
        Response <span className={`outcome ${r.outcome}`}>{r.outcome.toUpperCase()}</span>
      </h2>
      {r.error && <p className="error">{r.error}</p>}
      {r.response && (
        <p className="muted">
          HTTP {r.response.status} in {r.response.durationMs} ms
        </p>
      )}
      {r.assertions.length > 0 && (
        <table className="assertions">
          <thead>
            <tr>
              <th></th>
              <th>Target</th>
              <th>Expected</th>
              <th>Actual</th>
            </tr>
          </thead>
          <tbody>
            {r.assertions.map((a, i) => (
              <tr key={i} className={a.pass ? 'pass' : 'fail'}>
                <td>{a.pass ? '✓' : '✗'}</td>
                <td>{a.target}</td>
                <td>{a.expected}</td>
                <td>{a.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.response && <pre className="body">{r.response.json !== undefined ? JSON.stringify(r.response.json, null, 2) : r.response.bodyText}</pre>}
    </section>
  );
}
```

`src/webview/styles.css`:
```css
:root { color-scheme: light dark; }
body { margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.app { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
.brand { font-weight: 600; }
.env select { margin-left: 6px; }
.schema { font-size: 11px; opacity: 0.8; }
.schema-failed { color: var(--vscode-errorForeground); }
.schema-ready { color: var(--vscode-testing-iconPassed); }
.toolbar .primary { margin-left: auto; }
button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 10px; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: inherit; }
button:hover { background: var(--vscode-button-hoverBackground); }
button:disabled { opacity: 0.5; cursor: default; }
button.icon { background: transparent; color: var(--vscode-foreground); padding: 2px 6px; }
input, select, textarea { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 3px 6px; font-family: inherit; font-size: inherit; }
textarea.operation { width: 100%; min-height: 160px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); }
.banner { padding: 6px 12px; }
.banner.error { background: var(--vscode-inputValidation-errorBackground); border-bottom: 1px solid var(--vscode-inputValidation-errorBorder); }
.banner.info { background: var(--vscode-inputValidation-infoBackground); border-bottom: 1px solid var(--vscode-inputValidation-infoBorder); }
.panels { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr); flex: 1; min-height: 0; }
.panel { padding: 8px 12px; overflow: auto; border-right: 1px solid var(--vscode-panel-border); }
.panel:last-child { border-right: 0; }
h2 { font-size: 13px; margin: 4px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
h3 { font-size: 12px; margin: 10px 0 4px; }
.field { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.field-label { min-width: 80px; opacity: 0.8; font-size: 12px; }
.field input { flex: 1; }
.case-list { list-style: none; padding: 0; margin: 0; }
.case-list li { display: flex; align-items: center; gap: 2px; }
.case-list li.selected .case-row { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.case-row { flex: 1; text-align: left; background: transparent; color: var(--vscode-foreground); display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
.dot.passed { background: var(--vscode-testing-iconPassed); }
.dot.failed, .dot.error { background: var(--vscode-testing-iconFailed); }
.dot.skipped { background: var(--vscode-testing-iconSkipped); }
.add-case { display: flex; gap: 6px; margin: 8px 0; }
.add-case input { flex: 1; }
.muted { opacity: 0.7; }
.error { color: var(--vscode-errorForeground); }
.outcome { font-size: 11px; padding: 1px 6px; border-radius: 8px; margin-left: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.outcome.passed { background: var(--vscode-testing-iconPassed); color: #fff; }
.outcome.failed, .outcome.error { background: var(--vscode-testing-iconFailed); color: #fff; }
table.assertions { border-collapse: collapse; width: 100%; font-size: 12px; margin: 6px 0; }
table.assertions td, table.assertions th { text-align: left; padding: 2px 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
tr.fail td { color: var(--vscode-errorForeground); }
pre { font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre-wrap; word-break: break-word; margin: 4px 0; }
pre.body { max-height: 60vh; overflow: auto; }
.empty { padding: 24px; opacity: 0.8; }
.operation-editor .cm-editor { border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); min-height: 160px; font-size: 12px; }
.operation-editor .cm-editor.cm-focused { outline: 1px solid var(--vscode-focusBorder); }
.cm-tooltip pre.hover { margin: 0; padding: 4px 8px; }
```

- [ ] **Step 7: Verify build, types, purity, and the whole suite**

Run: `npm run build && ls -la dist/webview.js dist/webview.css && npm run check && npm test && npm run gen:check`
Expected: both bundles emitted (`dist/webview.css` exists because `main.tsx` imports the stylesheet); both typechecks clean; the purity guard now passes with all four directories present.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.webview.json esbuild.mjs .vscodeignore src/webview tests/webview tests/core/module-purity.test.ts
git commit -m "feat: React webview shell with pure state and bridge, widened purity guard"
```

---

### Task 5: CodeMirror operation editor (highlighting, completion, diagnostics, hover over the bridge)

**Files:**
- Create: `src/webview/graphql-stream.ts`
- Modify: `src/webview/OperationEditor.tsx` (replace the textarea body; props unchanged), `package.json` (deps)

**Interfaces:**
- Consumes: `OperationEditorProps`, `Bridge.complete/lint/hover`, `EditorView.cspNonce`.
- Produces: the editor used by `RequestPanel`. No new exports beyond `graphqlLanguage`.

- [ ] **Step 1: Install the CodeMirror packages**

Run: `npm install @codemirror/state@6.7.4 @codemirror/view@6.43.11 @codemirror/autocomplete@6.20.3 @codemirror/lint@6.9.7 @codemirror/language@6.12.4 @codemirror/commands@6.11.0 --no-audit --no-fund`

- [ ] **Step 2: Write `src/webview/graphql-stream.ts`**

```ts
import { StreamLanguage, type StreamParser } from '@codemirror/language';

const KEYWORDS = new Set(['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null']);

/**
 * Token-level GraphQL highlighting. Deliberately not a parser: the host owns
 * validation, and a grammar would drag `graphql` into the webview bundle.
 */
const parser: StreamParser<object> = {
  name: 'graphql',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('"""')) {
      // Block strings rarely appear in operations; paint the rest of the line.
      stream.skipToEnd();
      return 'string';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^\$[_A-Za-z][_0-9A-Za-z]*/)) return 'variableName';
    if (stream.match(/^@[_A-Za-z][_0-9A-Za-z]*/)) return 'meta';
    if (stream.match(/^[_A-Za-z][_0-9A-Za-z]*/)) {
      const word = stream.current();
      return KEYWORDS.has(word) ? 'keyword' : /^[A-Z]/.test(word) ? 'typeName' : 'propertyName';
    }
    if (stream.match(/^[{}()[\]:!=,|&.]/)) return 'punctuation';
    stream.next();
    return null;
  },
};

export const graphqlLanguage = StreamLanguage.define(parser);
```

- [ ] **Step 3: Replace `src/webview/OperationEditor.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, hoverTooltip, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintKeymap, type Diagnostic } from '@codemirror/lint';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { TextPosition } from '../shared/protocol';
import type { Bridge } from './bridge';
import { graphqlLanguage } from './graphql-stream';

export interface OperationEditorProps {
  text: string;
  bridge: Bridge;
  nonce: string;
  schemaReady: boolean;
  onCommit: (text: string) => void;
}

const toPosition = (state: EditorState, offset: number): TextPosition => {
  const line = state.doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
};

const toOffset = (state: EditorState, pos: TextPosition): number => {
  const line = state.doc.line(Math.min(Math.max(pos.line + 1, 1), state.doc.lines));
  return Math.min(line.from + pos.character, line.to);
};

/**
 * CodeMirror 6 operation editor. Every language answer comes from the host
 * over the bridge (decision 1: only UI runs here); the editor is created once
 * and receives later `text` values through a document replacement.
 */
export function OperationEditor({ text, bridge, nonce, schemaReady, onCommit }: OperationEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | undefined>(undefined);
  // Callbacks and flags read at event time; a ref keeps the extensions stable across renders.
  const latest = useRef({ text, bridge, schemaReady, onCommit });
  latest.current = { text, bridge, schemaReady, onCommit };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const complete = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
      if (!latest.current.schemaReady) return null;
      const word = ctx.matchBefore(/[_A-Za-z0-9]*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const items = await latest.current.bridge.complete(ctx.state.doc.toString(), toPosition(ctx.state, ctx.pos));
      return {
        from: word.from,
        options: items.map((i) => ({ label: i.label, detail: i.detail, info: i.documentation })),
        validFor: /^[_A-Za-z0-9]*$/,
      };
    };

    const lint = async (v: EditorView): Promise<Diagnostic[]> => {
      if (!latest.current.schemaReady) return [];
      const items = await latest.current.bridge.lint(v.state.doc.toString());
      return items.map((d) => {
        const from = toOffset(v.state, d.start);
        return { from, to: Math.max(from, toOffset(v.state, d.end)), severity: d.severity, message: d.message };
      });
    };

    const hover = hoverTooltip(async (v, pos) => {
      if (!latest.current.schemaReady) return null;
      const info = await latest.current.bridge.hover(v.state.doc.toString(), toPosition(v.state, pos));
      if (!info) return null;
      return {
        pos,
        create: () => {
          const dom = document.createElement('pre');
          dom.className = 'hover';
          dom.textContent = info;
          return { dom };
        },
      };
    });

    const extensions: Extension[] = [
      EditorView.cspNonce.of(nonce),
      lineNumbers(),
      history(),
      graphqlLanguage,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({ override: [complete] }),
      linter(lint, { delay: 400 }),
      hover,
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
      placeholder('query { ... }'),
      EditorView.domEventHandlers({
        blur: (_event, v) => {
          const current = v.state.doc.toString();
          if (current !== latest.current.text) latest.current.onCommit(current);
        },
      }),
      EditorView.theme({
        '&': { backgroundColor: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' },
        '.cm-content': { fontFamily: 'var(--vscode-editor-font-family)' },
        '.cm-gutters': {
          backgroundColor: 'var(--vscode-editorGutter-background)',
          color: 'var(--vscode-editorLineNumber-foreground)',
          border: 'none',
        },
      }),
    ];

    const v = new EditorView({ state: EditorState.create({ doc: latest.current.text, extensions }), parent });
    view.current = v;
    return () => {
      v.destroy();
      view.current = undefined;
    };
  }, [nonce]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== text) v.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }, [text]);

  return <div ref={host} className="operation-editor" />;
}
```

- [ ] **Step 4: Verify build, types, purity, and the whole suite**

Run: `npm run build && npm run check && npm test`
Expected: green. Then confirm the bundle has no GraphQL runtime and does carry CodeMirror:
Run: `node -e "const s=require('node:fs').readFileSync('dist/webview.js','utf8'); if(/graphql-language-service|buildSchema\(/.test(s)) process.exit(1); if(!/cspNonce/.test(s)) process.exit(2); console.log('webview bundle: no graphql runtime, cspNonce present, ' + Math.round(s.length/1024) + ' KB')"`
Expected: prints the line; exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/webview/graphql-stream.ts src/webview/OperationEditor.tsx
git commit -m "feat: CodeMirror operation editor with host-served completion, diagnostics, and hover"
```

---

### Task 6: Extension wiring (custom editor provider, run store, manifest contributions)

**Files:**
- Create: `src/editor-provider.ts`
- Modify: `src/extension.ts`, `package.json` (contributions)

**Interfaces:**
- Consumes: Task 3 host modules, `isWebviewMessage`, `salvo-language` wrappers via the lazy `lang()`.
- Produces:
  ```ts
  // editor-provider.ts
  export const VIEW_TYPE = 'salvo.editor';
  export interface EditorServices {
    project(doc: vscode.TextDocument): Promise<{ schema: GraphQLSchema | undefined; schemaStatus: SchemaStatus; envName: string | undefined; envNames: string[] }>;
    setEnvironment(doc: vscode.TextDocument, name: string): Promise<void>;
    run(doc: vscode.TextDocument, selected: number[] | 'all'): Promise<void>;
    lang(): Promise<typeof import('./host/salvo-language')>;
    runStore: RunStore;
  }
  export class SalvoEditorProvider implements vscode.CustomTextEditorProvider { constructor(extensionUri: vscode.Uri, services: EditorServices) }
  ```
  Command id `salvo.openEditor`; the `salvo.runCases` command now also feeds the RunStore so an open visual editor shows the results.

- [ ] **Step 1: package.json contributions**

Add `"onCustomEditor:salvo.editor"` to `activationEvents`. Under `contributes` add:
```json
    "customEditors": [
      {
        "viewType": "salvo.editor",
        "displayName": "Salvo Editor",
        "selector": [{ "filenamePattern": "*.salvo" }],
        "priority": "option"
      }
    ],
    "menus": {
      "editor/title": [
        { "command": "salvo.openEditor", "when": "resourceExtname == .salvo", "group": "navigation" }
      ]
    }
```
and append to `commands`:
```json
      { "command": "salvo.openEditor", "title": "Salvo: Open Visual Editor", "icon": "$(open-preview)" }
```

- [ ] **Step 2: Create `src/editor-provider.ts`**

```ts
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { GraphQLSchema } from 'graphql';
import { isWebviewMessage, type EditorSnapshot, type HostToWebview, type SchemaStatus } from './shared/protocol';
import { applyFieldEdit, buildDocumentView, EchoGuard, type FieldEdit } from './host/document-sync';
import { buildWebviewHtml } from './host/webview-html';
import type { RunStore } from './host/run-store';

export const VIEW_TYPE = 'salvo.editor';

/** What the composition root lends the editor: project lookups, environment switching, runs, and the lazy language module. */
export interface EditorServices {
  project(doc: vscode.TextDocument): Promise<{
    schema: GraphQLSchema | undefined;
    schemaStatus: SchemaStatus;
    envName: string | undefined;
    envNames: string[];
  }>;
  setEnvironment(doc: vscode.TextDocument, name: string): Promise<void>;
  run(doc: vscode.TextDocument, selected: number[] | 'all'): Promise<void>;
  lang(): Promise<typeof import('./host/salvo-language')>;
  runStore: RunStore;
}

/**
 * The visual editor. VS Code owns the TextDocument (dirty state, undo, save,
 * hot exit); we push snapshots into the webview and turn its intents into
 * WorkspaceEdits (decisions 2, 8, 9).
 */
export class SalvoEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly services: EditorServices
  ) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const nonce = randomBytes(16).toString('base64');
    panel.webview.html = buildWebviewHtml({
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css')).toString(),
      cspSource: panel.webview.cspSource,
      nonce,
    });

    const key = document.uri.toString();
    const guard = new EchoGuard();
    let disposed = false;
    const post = (msg: HostToWebview): void => {
      if (!disposed) void panel.webview.postMessage(msg);
    };

    const pushState = async (): Promise<void> => {
      const p = await this.services.project(document);
      if (disposed || document.isClosed) return; // the panel may have gone while the schema loaded
      const entry = this.services.runStore.get(key);
      const snapshot: EditorSnapshot = {
        view: buildDocumentView(document.getText()),
        ...(p.envName !== undefined ? { envName: p.envName } : {}),
        envNames: p.envNames,
        schema: p.schemaStatus,
        ...(entry ? { results: entry.results } : {}),
        running: entry?.running ?? false,
      };
      post({ type: 'state', snapshot });
    };

    const applyEdit = async (edit: FieldEdit): Promise<void> => {
      const result = applyFieldEdit(document.getText(), edit);
      if (!result.ok) {
        post({ type: 'notice', level: 'error', message: result.error });
        return;
      }
      if (!result.replace) return;
      const we = new vscode.WorkspaceEdit();
      we.replace(
        document.uri,
        new vscode.Range(document.positionAt(result.replace.start), document.positionAt(result.replace.end)),
        result.replace.text
      );
      guard.markOwn(result.text);
      if (!(await vscode.workspace.applyEdit(we))) {
        post({ type: 'notice', level: 'error', message: 'The edit could not be applied.' });
        return;
      }
      // The echo guard swallows the change event of our own edit, so push the
      // new snapshot here. Without it an added or removed case never reaches
      // the panel that asked for it (ruling 2026-10-02).
      await pushState();
    };

    const onMessage = async (raw: unknown): Promise<void> => {
      if (!isWebviewMessage(raw)) return;
      switch (raw.type) {
        case 'ready':
          return pushState();
        case 'edit':
          return applyEdit({ kind: 'scalar', path: raw.path, value: raw.value });
        case 'editOperation':
          return applyEdit({ kind: 'operation', text: raw.text });
        case 'appendCase':
          return applyEdit({ kind: 'appendCase', name: raw.name });
        case 'removeCase':
          return applyEdit({ kind: 'removeCase', index: raw.index });
        case 'run':
          return this.services.run(document, raw.selected);
        case 'selectEnvironment':
          await this.services.setEnvironment(document, raw.name);
          return pushState();
        case 'lang': {
          const { schema } = await this.services.project(document);
          const l = await this.services.lang();
          if (raw.op === 'lint') {
            post({ type: 'langResult', id: raw.id, op: 'lint', items: l.diagnosticsInOperation(schema, raw.text) });
          } else if (raw.op === 'complete') {
            post({ type: 'langResult', id: raw.id, op: 'complete', items: l.completionsInOperation(schema, raw.text, raw.pos) });
          } else {
            const text = l.hoverInOperation(schema, raw.text, raw.pos);
            post({ type: 'langResult', id: raw.id, op: 'hover', ...(text !== undefined ? { text } : {}) });
          }
          return;
        }
      }
    };

    const subscriptions: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((m: unknown) => void onMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== key) return;
        if (guard.isEcho(e.document.getText())) return; // our own WorkspaceEdit (decision 9.2)
        void pushState();
      }),
      { dispose: this.services.runStore.onChange((changed) => changed === key && void pushState()) },
    ];
    panel.onDidDispose(() => {
      disposed = true;
      for (const s of subscriptions) s.dispose();
    });
  }
}
```

- [ ] **Step 3: Rewire `src/extension.ts`**

Apply these changes to the existing file (everything not mentioned stays as it is):

1. Imports: add
```ts
import { RunStore, mergeResults } from './host/run-store';
import { SalvoEditorProvider, VIEW_TYPE, type EditorServices } from './editor-provider';
import type { SchemaStatus } from './shared/protocol';
```

2. Inside `activate`, right after `const timers = …`, add `const runStore = new RunStore();`.

3. Replace the `salvo.runCases` command body's run logic with a shared function. Add this function after `requireSalvoEditor`:
```ts
  /** One run path for the command and the visual editor: results land in the RunStore, the text report in the output channel. */
  async function runDocument(doc: vscode.TextDocument, selected: number[] | 'all'): Promise<void> {
    const key = doc.uri.toString();
    const { ctx } = await getProject(doc);
    const manifest = ctx.located?.manifest;
    const envName = envFor(ctx) ?? 'default';
    const secrets = createSecretResolver(context.secrets, manifest?.id ?? 'no-project', envName);
    const previous = runStore.get(key)?.results ?? [];
    runStore.setRunning(key);
    const outcome = await runSalvoFile({
      fileText: doc.getText(),
      manifest,
      envName,
      selected,
      deps: { secrets, send: createFetchTransport() },
    });
    if (!outcome.ok) {
      runStore.setResults(key, previous);
      void vscode.window.showErrorMessage(`Salvo: cannot run — ${outcome.issues[0]?.message ?? 'parse failed'}`);
      return;
    }
    runStore.setResults(key, selected === 'all' ? outcome.results : mergeResults(previous, outcome.results));
    output.appendLine('');
    output.appendLine(outcome.report);
  }

  async function saveEnvironment(doc: vscode.TextDocument, name: string): Promise<void> {
    const { ctx } = await getProject(doc);
    const manifest = ctx.located?.manifest;
    if (!manifest || !Object.hasOwn(manifest.environments ?? {}, name)) return;
    const saved = context.workspaceState.get<Record<string, string>>(ENV_STATE_KEY, {});
    await context.workspaceState.update(ENV_STATE_KEY, { ...saved, [manifest.id]: name });
    scheduleRefresh(doc);
  }

  const services: EditorServices = {
    async project(doc) {
      const { ctx } = await getProject(doc);
      const manifest = ctx.located?.manifest;
      const schemaStatus: SchemaStatus = !manifest?.schema ? 'none' : ctx.schema ? 'ready' : ctx.schemaIssues ? 'failed' : 'loading';
      return { schema: ctx.schema, schemaStatus, envName: envFor(ctx), envNames: Object.keys(manifest?.environments ?? {}) };
    },
    setEnvironment: saveEnvironment,
    run: runDocument,
    lang,
    runStore,
  };
```

4. The `salvo.runCases` command becomes:
```ts
    vscode.commands.registerCommand('salvo.runCases', async () => {
      const editor = requireSalvoEditor();
      if (!editor) return;
      await runDocument(editor.document, 'all');
      output.show(true);
    }),
```

5. In `salvo.selectEnvironment`, replace the two lines that read `saved` and call `workspaceState.update` with `await saveEnvironment(editor.document, picked);` (keep the `updateStatus(editor)` call; drop the now-redundant `scheduleRefresh` since `saveEnvironment` does it).

6. Add the provider registration and the new command to the `context.subscriptions.push(...)` list:
```ts
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new SalvoEditorProvider(context.extensionUri, services), {
      webviewOptions: { retainContextWhenHidden: false },
      supportsMultipleEditorsPerDocument: true,
    }),

    vscode.commands.registerCommand('salvo.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || !target.path.endsWith('.salvo')) {
        void vscode.window.showInformationMessage('Salvo: open a .salvo file first.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
    }),
```

7. In the `onDidCloseTextDocument` handler add `runStore.clear(key);` after `diagnostics.delete(doc.uri);`.

- [ ] **Step 4: Verify build, types, purity, and the whole suite**

Run: `npm run build && npm run check && npm test && npm run gen:check`
Expected: all green. Then the manifest sanity check:
Run: `node -e "const p=require('./package.json'); const c=p.contributes; if(c.customEditors[0].viewType!=='salvo.editor'||c.customEditors[0].priority!=='option') process.exit(1); if(!c.commands.some(x=>x.command==='salvo.openEditor')) process.exit(2); if(!p.activationEvents.includes('onCustomEditor:salvo.editor')) process.exit(3); console.log('manifest ok')"`
Expected: `manifest ok`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/editor-provider.ts src/extension.ts
git commit -m "feat: custom editor provider, shared run store, and Open Visual Editor command"
```

---

### Task 7: Electron smoke for the custom editor, docs, version 0.1.1, packaging gate

**Files:**
- Modify: `tests/vscode/extension.smoke.test.ts` (add a test), `package.json` (version), `CHANGELOG.md`, `README.md`, `examples/quickstart/README.md`, `CLAUDE.md`, `.claude/architecture.md`, `.claude/conventions.md`, `.claude/roadmap.md`

**Interfaces:**
- Consumes: the packaged extension surface from Tasks 4–6.
- Produces: plan 3b's exit gate (`npm run test:vscode` with 2 passing, `npm run package` with the webview bundle inside the vsix).

- [ ] **Step 1: Add the custom editor smoke test**

Append inside the `suite` in `tests/vscode/extension.smoke.test.ts`:
```ts
  test('opens a .salvo file in the visual editor', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'quickstart workspace folder missing');
    const uri = vscode.Uri.joinPath(folder.uri, 'countries.salvo');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'salvo.editor');
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom, 'active tab is not a custom editor');
    assert.strictEqual(input.viewType, 'salvo.editor');
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('salvo.openEditor'), 'missing command salvo.openEditor');
  });
```

- [ ] **Step 2: Docs and version**

`package.json`: `"version": "0.1.1"` (conventions: any manifest change bumps patch; 0.1.0 is already on the Marketplace).

`CHANGELOG.md` (replace the file):
```markdown
# Changelog

## 0.1.1 (unreleased)

- Visual editor: open any `.salvo` file with **Reopen With → Salvo Editor**,
  the editor-title button, or `Salvo: Open Visual Editor`. Edit the URL,
  headers, case names and variables, add or remove cases, run all cases or
  one, and read each case's response and assertions.
- The operation editor is CodeMirror with schema-driven completion,
  diagnostics, and hover, all computed in the extension host from your local
  SDL (the webview never sees the schema file or the network).
- Every edit made in the visual editor is a minimal text edit of the same
  document: comments, key order, and block style survive; undo and save work
  as usual, and the plain text editor can stay open beside it.
- Run results are redacted: any resolved secret value is replaced before it
  reaches the report or the editor.
- Fixed: operations written with an explicit block indentation indicator
  (`operation: |2`) reported diagnostics at the wrong column.

## 0.1.0

First pre-release, GraphQL-first:

- `.salvo` request files with named cases and declarative expectations
- GraphQL diagnostics, completions, and hover inside the text editor,
  powered by a local SDL file, an introspection JSON file, or (opt-in)
  live introspection. No account, no cloud.
- Environments in `salvo.yaml`, secrets in VS Code `SecretStorage`
- `Salvo: Run Cases in Current File` with a per-case pass/fail report
```

`README.md`: replace the status blockquote with:
```markdown
> **Status: pre-release 0.1.x on the Marketplace.**
> `.salvo` files work in two editors: the plain text editor (GraphQL
> diagnostics, completions, hover) and the visual editor (request form,
> cases, runs, responses). Environments, secrets, and case runs are shared
> between them. See the
> [roadmap](https://github.com/jungsehui/salvo/blob/main/.claude/roadmap.md)
> for what v0.1 does and does not contain.
```
and add this section right before the section titled "Design" (or before the license section if there is no "Design" heading):
```markdown
## Visual editor

Right-click a `.salvo` file → **Open With → Salvo Editor**, click the
preview button in the editor title, or run `Salvo: Open Visual Editor`.
Three panels: the request (URL, headers, operation), the cases (add,
remove, run one, run all), and the selected case's response with its
assertions. The operation editor completes and validates against your
schema. Every edit is written back into the same text document as a
minimal change, so `git diff` stays readable and the text editor can stay
open next to it.
```

`examples/quickstart/README.md`: replace the last paragraph ("Until the VS Code editor lands…") with:
```markdown
Open `countries.salvo`, then **Salvo: Open Visual Editor** (or the preview
button in the editor title) and press **Run all cases**. The same two cases
also run from `Salvo: Run Cases in Current File` in the text editor.
```

`CLAUDE.md`: replace the `- **Status**:` bullet with:
```markdown
- **Status**: v0.1 complete (plans 1-3b merged: core, GraphQL layer,
  extension foundation, visual editor). 0.1.0 is on the Marketplace as a
  pre-release; 0.1.1 adds the visual editor. Next: v0.2 (query builder,
  schema docs panel) per `.claude/roadmap.md`.
```

`.claude/architecture.md`: replace the first two lines after the title (`아직 코드가 없다. …` and the `2026-08-21 외부 설계 리뷰…` line) with:
```markdown
v0.1 구현이 끝났다(2026-09). 이 문서는 착수 전에 고정한 경계와 결정이며, 구현은
전부 이 결정을 따랐다. 2026-08-21 외부 설계 리뷰를 반영해 개정했다(결정 3 근거
교체, 결정 8~9 신설).
```

`.claude/roadmap.md`: in the v0.1 minimum list, replace item 2 with the line below. The shipped loader reads the manifest, not graphql-config (drift found 2026-10-02):
```markdown
2. `salvo.yaml`의 `schema` 키가 가리키는 로컬 SDL 파일(또는 introspection JSON, opt-in URL)을 읽어 스키마를 로드한다
```

`.claude/conventions.md`: replace the first paragraph (`코드가 아직 없다. …`) with:
```markdown
`custom-intellij-nav`에서 검증된 규칙과, 조사에서 확인된 VS Code API 제약에서
도출한 규칙이다. v0.1 코드는 전부 이 규칙 아래에서 작성됐다.
```

- [ ] **Step 3: Run the electron smoke and the packaging gate**

Run: `npm run test:vscode`
Expected: `2 passing`. If VS Code cannot be downloaded in this environment, report BLOCKED with the exact error; never fake the result.
Then: `npm run package && unzip -l salvo-0.1.1.vsix | grep -E "dist/(extension|webview)\.(js|css)$"`
Expected: `salvo-0.1.1.vsix` produced; the listing shows `extension/dist/extension.js`, `extension/dist/webview.js`, and `extension/dist/webview.css`.
Then the full local gate: `npm test && npm run check && npm run gen:check && grep -ri "linkareer" src tests examples schemas; echo "grep exit $?"` (expected: no matches, exit 1 from grep).

- [ ] **Step 4: Commit**

```bash
git add tests/vscode/extension.smoke.test.ts package.json CHANGELOG.md README.md examples/quickstart/README.md CLAUDE.md .claude/architecture.md .claude/conventions.md .claude/roadmap.md
git commit -m "test: visual editor smoke, docs for 0.1.1, version bump"
```

---

## Exit Criteria for Plan 3b

- `npm test` (core+host+shared+webview), `npm run check` (both tsconfigs), `npm run gen:check`, `npm run build` (both bundles), `npm run test:vscode` (2 passing), `npm run package` (vsix carries `dist/webview.js` and `dist/webview.css`): all green.
- Purity guard covers `src/core`, `src/host`, `src/shared`, `src/webview`; the webview bundle contains no `graphql-language-service`.
- Manual F5 sanity (documented, not automated): open `examples/quickstart/countries.salvo` → `Salvo: Open Visual Editor` → env `demo` in the toolbar, **Run all cases** turns both dots green, the text editor beside it shows the minimal diff when a URL or case name is edited, and typing in the operation editor with `schema: ready` offers completions.
- `grep -ri "linkareer" src tests examples schemas` still empty.

## What v0.2 Will Consume

- `EditorSnapshot`/`WebviewToHost` are the extension points for the query builder and the schema docs panel (add message variants; the guard forces validation).
- `Bridge` request correlation generalizes to any host-served answer (schema type lookups for the docs panel).
- The `|N` fix makes file positions precise for all block styles; folded (`>`) and plain scalars still anchor at the scalar (by design).
