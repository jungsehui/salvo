# HTTP core (Salvo 0.2.0) design

Status: approved in conversation 2026-10-07, section by section. First sub-project of
roadmap milestone v0.2 "HTTP 전면" (`.claude/roadmap.md`).

## Decisions taken with the user

| Date | Decision |
|---|---|
| 2026-10-04 | Marketplace positioning: a general-purpose API testing tool; descriptions state only what ships. |
| 2026-10-06 | HTTP before GraphQL depth. Roadmap renumbered: v0.2 = HTTP, v0.3 = GraphQL depth. |
| 2026-10-06 | 0.1.x ships on the stable channel (0.1.0 was already stable). |
| 2026-10-07 | First scenario: per-token permission checks against a REST endpoint (valid, expired, forbidden, no token). |
| 2026-10-07 | Visual editor at GraphQL parity: edit existing values, no adding or removing keys. |
| 2026-10-07 | File shape: an HTTP request is a `request` without `operation`. |
| 2026-10-07 | Typed substitution and null omission for HTTP requests only; GraphQL `variables` keep today's behavior. |
| 2026-10-07 | Release as 0.2.0. |

## Goal

The case model (one request, many named cases, each with its own declarative
expectations) works for REST endpoints the way it works for GraphQL today.

Success criteria:
1. A `.salvo` file with an HTTP request runs its cases from the command palette and the
   visual editor, with `status`, `headers` and `json` expectations.
2. A permission-check file (valid, expired, forbidden, no token) runs against a local
   test server in the integration suite and produces the expected outcomes.
3. Every existing test passes unchanged. Existing GraphQL `.salvo` files behave as before,
   except the one documented header change (null omission, section 1).
4. The quickstart ships two HTTP examples against httpbin.org that run on first open.

## Scope

In: methods GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS; `query`; `headers`; bodies
`json`, `text`, `form`; `auth.basic`; schema and parser support; text-editor diagnostics;
visual editor at GraphQL parity; docs; version 0.2.0.

Out (later sub-projects of v0.2): OAuth2, AWS SigV4, multipart and binary bodies, `.http`
import, response viewer improvements, adding or removing keys in the visual editor, a
redirect option, cookies and sessions. Request chaining stays in v0.4.

## 1. File format

A `request` with `operation` is a GraphQL request, unchanged. A `request` without
`operation` is an HTTP request:

```yaml
salvo: 1
request:
  method: GET                 # GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS; default GET
  url: "{{baseUrl}}/users/{{userId}}"
  query: { page: 1, sort: "{{sort}}" }
  headers:
    authorization: "{{auth}}"
  body:                       # optional; exactly one of json | text | form
    json: { name: "{{name}}", age: "{{age}}" }
  # auth: { basic: { username: "{{user}}", password: "{{secret:PW}}" } }
  timeoutMs: 30000            # optional, as today

cases:
  - name: valid token
    vars: { auth: "Bearer {{secret:VALID_TOKEN}}", age: 30 }
    expect: { status: 200 }
  - name: no token
    vars: { auth: null }
    expect: { status: 401 }
```

Field types:
- `query`: map of string to string | number | boolean | null.
- `headers`: map of string to string (as today).
- `body.json`: any JSON value. `body.text`: string. `body.form`: map of string to
  string | number | boolean | null.
- `auth.basic`: `{ username: string, password: string }`. `password` may be omitted
  (treated as empty).

### Substitution rules (HTTP requests)

Placeholders are `{{name}}` and `{{secret:NAME}}` as today, with the same precedence
(environment < file < case) and the same cycle and missing-value errors.

1. **Typed single placeholder.** A string whose entire content is one placeholder takes
   the variable's value with its type (string, number, boolean, null). Secrets are always
   strings. Any other string with placeholders becomes a string, as today. Only
   `body.json` keeps the type in the request; locations that carry text (`url`, header
   values, `query` values, `form` values, `body.text`, `auth.basic`) stringify numbers and
   booleans after the null check.
2. **Null omission.** If a single placeholder resolves to `null`, the entry is omitted:
   a header, a `query` entry, a `form` field, or a `json` object property. Inside a `json`
   array, the element stays `null` (omitting would shift indexes). In `body.json`, a
   literal `null` written in the file (not a placeholder) is kept. In `query` and `form`,
   which carry text, any `null` (literal or resolved) omits the entry.
3. **Where substitution applies.** `url` (string result), `query` values, header values,
   `body.text` (string result), `body.form` values, every string in `body.json` at any
   depth (object keys are not substituted), `auth.basic.username` and `.password`.
4. **Basic auth.** `Authorization: Basic base64(utf8(username + ":" + password))`. If
   `username` is a single placeholder resolving to `null`, no Authorization header is
   sent. A `password` resolving to `null` is treated as empty.

GraphQL requests keep today's rules: `variables` substitutes top-level strings only, as
strings. The one change that reaches GraphQL files: a header value that is a single
placeholder resolving to `null` is now omitted instead of sent empty. CHANGELOG records it.

### Headers and body encoding

- Environment headers merge under request headers (request wins), keys lower-cased, as
  today. Null omission runs after the merge.
- Default Content-Type when a body is present and no `content-type` header is set:
  `json` → `application/json`, `form` → `application/x-www-form-urlencoded`,
  `text` → `text/plain; charset=utf-8`. An explicit header wins.
- `json` is sent as `JSON.stringify` of the substituted value. `form` is encoded with
  `URLSearchParams` (numbers and booleans stringified). `query` entries are appended to
  the URL with `URLSearchParams`, keeping any query already in `url`.

### Rules the parser enforces (with an English message at the offending key)

| Situation | Message (gist) |
|---|---|
| `body` with method GET or HEAD (including the GET default) | A GET request cannot have a body. Set request.method or remove request.body. |
| `body`, `query` or `auth` in a GraphQL request | These are for HTTP requests; a GraphQL request sends its operation as the body. |
| `variables` or `operationName` in an HTTP request | These are for GraphQL requests. |
| `body` with zero or more than one of json, text, form | Use exactly one of json, text, form. |
| `auth.basic` together with an `authorization` header | Use either request.auth or an authorization header, not both. |

Expectations are unchanged: `status`, `headers`, `json`, and the six matchers.

## 2. Engine

`ResolvedRequest` (`src/core/types.ts`) becomes protocol-neutral:

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export interface GraphqlPayload { kind?: 'graphql'; query: string; variables?: Record<string, unknown>; operationName?: string }
export interface EncodedBody { kind: 'encoded'; text: string; query?: never; variables?: never; operationName?: never }
export interface NoBody { kind: 'none'; query?: never; variables?: never; operationName?: never }
export type RequestBody = GraphqlPayload | EncodedBody | NoBody;
export interface ResolvedRequest {
  method: HttpMethod;
  url: string;                      // final URL, query appended
  headers: Record<string, string>;  // lower-cased keys; content-type and authorization included
  body: RequestBody;                // GraphQL payload (the transport makes it JSON), an encoded HTTP body, or none
  timeoutMs: number;
}
```

Amended during planning (2026-10-07): the first draft made `body` a plain string. Two
existing test files read `request.body.query` and build a `{ query, variables }` body, and
success criterion 3 forbids changing them. The union keeps that shape valid (the GraphQL
variant's `kind` is optional) while HTTP builders hand the transport an encoded body.

| Module | Responsibility |
|---|---|
| `src/core/vars/substitute.ts` (new) | The placeholder engine, extracted from `resolve-case.ts`, plus typed single placeholders, null omission, and deep JSON substitution. Collects missing vars, missing secrets, cycles. |
| `src/core/request/build-graphql.ts` (new) | Today's GraphQL assembly: POST, JSON body `{query, variables, operationName}`, default `application/json`. Byte-identical output for existing files. |
| `src/core/request/build-http.ts` (new) | Method, URL with query, headers, body encoding, Basic auth. |
| `src/shared/request-kind.ts` (new) | `isGraphqlRequest(req)`: a dependency-free type guard usable by core, host and webview. |
| `src/core/vars/resolve-case.ts` | Case lookup, environment whitelist, error aggregation; dispatches to one builder. |
| `src/core/http/fetch-transport.ts` | Sends `req.body` as given with `req.method` and `req.headers`. No JSON or Content-Type logic. Timeout and abort unchanged. |

Errors: `runCases` still never throws and returns one result per case. A URL that does not
parse as http or https after substitution is a case error ("Invalid URL after
substitution: ..."). Missing vars, missing secrets and cycles are reported as today.

Sensitive values: `runCases` deps gain an optional `sensitive?: (value: string) => void`.
`build-http` reports every Basic credential (the base64 string) through it.
`runSalvoFile` adds those values to the redaction set alongside resolved secrets, so a
server that echoes request headers cannot leak the encoded password into results or the
report.

Redirects are followed, as today. Known limitation: an API that redirects unauthenticated
requests to a login page shows the final page's status. An opt-out comes with a later
sub-project.

## 3. Schema, parser, text editor

- `schemas/salvo-file.schema.json`: `request` becomes `oneOf` of `GraphqlRequest`
  (requires `operation`) and `HttpRequest` (forbids `operation`). Generated types become
  `GraphqlRequest | HttpRequest`.
- `parseSalvoFile` picks the branch by the presence of `operation` and reports only that
  branch's schema errors, so users never see "must match exactly one schema". It then
  applies the rules in section 1 with positions at the offending key.
- redhat.vscode-yaml reads the same schema through `contributes.yamlValidation`, so method
  values and body kinds complete there for free. Without it, the parser diagnostics still
  appear.
- GraphQL completion, hover and diagnostics stay limited to files with `operation`
  (already true). Environments, secrets, commands, status bar and the text report are
  unchanged.

## 4. Visual editor

The request panel branches on `isGraphqlRequest`. Cases and results panels are shared and
unchanged.

| Item | HTTP file | Edit |
|---|---|---|
| Method | select of the seven methods | New message `setMethod { method }`. Creates `request.method` when absent (the one key the GUI may create). |
| URL | field | as today |
| Query, headers, form fields, `auth.basic` | fields for existing entries | value edits only, through the existing `edit` path |
| `body.text` | multi-line field | value edit |
| `body.json` | JSON text area (pretty-printed) | New message `editJsonBody { text }`. Invalid JSON: notice, file untouched. Valid: replace the `request.body.json` node; keep flow style if the original node was flow style. |
| GraphQL operation editor, schema status | hidden | shown for GraphQL files only |

Existing guarantees carry over: edits that would make a valid file invalid are refused
(switching a request with a body to GET is refused with the parser's message); the GUI is
read-only while the file fails the schema; the save shortcut, caret keeping and echo guard
apply to the new fields (ScalarField gains a `multiline` mode sharing the same logic). Both
new messages pass `isWebviewMessage` (method from the enum; text a string).

Known limitation: editing `body.json` in the GUI drops YAML comments inside that body
block. Comments and key order elsewhere are preserved.

## 5. Testing, examples, docs, version

Tests (every existing test unchanged):
- Unit: substitution (typed, null omission, deep JSON, arrays keep null, mixed strings,
  secrets as strings, cycles); `build-http` (each method, query encoding and merge with an
  existing query, Content-Type defaults and override, form encoding, text, json, Basic
  UTF-8 base64, null username omits the header, sensitive callback); `build-graphql`
  output equal to today's; parser branch selection and each rule in section 1; document
  sync (`setMethod` creating the key, JSON body replace with flow style kept, invalid JSON
  refused, switch to GET with a body refused); protocol guard for the two new messages.
- Integration: a local HTTP server inside the test checks `authorization` and returns
  200, 401 or 403 JSON; an HTTP `.salvo` file with four cases (valid, expired, forbidden,
  none) runs through `runSalvoFile`; the echoed bearer token and Basic credential are
  redacted. No external network.
- Real VS Code: one smoke test opens an HTTP example in the visual editor.

Quickstart: `examples/quickstart/httpbin-bearer.salvo` (valid token, empty token, no
token) and `httpbin-basic.salvo` (right password, wrong password, no auth) against
https://httpbin.org; the `demo` environment gains `httpbinUrl`. Demo tokens are plain vars
so the files run on first open; a comment points real tokens at Set Secret. The quickstart
README names httpbin.org as a public third-party service.

Docs: README gains an HTTP section and the renumbered roadmap table; CHANGELOG 0.2.0
lists the features and the null-omission header change; `.claude/architecture.md` records
the request-shape decision and the two substitution rules as decision 11; CLAUDE.md
status updated.

Version and listing: `package.json` 0.2.0. Description widened to what ships ("REST and
GraphQL over HTTP"); add the `rest` keyword. No claim of OAuth2, file uploads or other
protocols.

## Risks

- httpbin.org availability affects only the demo files, never the test suite.
- redhat's handling of `oneOf` errors may be noisier than Salvo's own diagnostics.
- GUI edits of a JSON body drop comments inside that body (documented).
- Redirects are followed (documented; opt-out later).
