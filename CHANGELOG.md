# Changelog

## 0.2.0 (2026-10-08)

- REST over HTTP: a request without `operation` is a plain HTTP request with
  any method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), `query`
  parameters, headers, a `json`, `text`, or `form` body, and Basic auth.
  Cases, environments, secrets, and expectations work exactly as for GraphQL.
- Inside a JSON body, a value that is exactly one `{{var}}` keeps the
  variable's type (numbers stay numbers). A `null` value leaves its header,
  query parameter, form field, or JSON property out (array elements keep
  `null`), so a "no token" case can omit the Authorization header.
- The visual editor shows HTTP requests with a method picker and fields for
  the query, headers, body, and Basic auth.
- The quickstart gains two httpbin.org examples (bearer token and Basic auth).
- Basic credentials are redacted from results and reports like secrets.
- Changed: in GraphQL files too, a header whose value is exactly one `{{var}}`
  that resolves to `null` is now left out instead of sent empty.
- Changed: a URL that is not an absolute http or https URL after substitution
  is reported as a case error before anything is sent.

## 0.1.1 (not published; these changes ship in 0.2.0)

- Visual editor: open any `.salvo` file with **Open With… → Salvo Editor** (or **Reopen Editor With…** on an open tab),
  the editor-title button, or `Salvo: Open Visual Editor`. Edit the URL,
  headers, case names and variables, add or remove cases, run all cases or
  one, and read each case's response and assertions.
- The operation editor is CodeMirror with schema-driven completion,
  diagnostics, and hover, all computed in the extension host from your local
  SDL (the webview never sees the schema file or the network).
- Every edit made in the visual editor is written back into the same text
  document as one small range edit: comments, key order, block scalars, and
  untouched long lines survive, and undo and save work as usual. The first
  edit of a file may normalize its indentation, comment spacing, and hand-wrapped plain scalars.
- Saving with Cmd/Ctrl+S commits the field you are typing in and keeps the
  cursor there; switching away from the editor commits it too.
- Run results are redacted: every resolved secret value of four or more
  characters is replaced wherever it appears verbatim, before it reaches the
  report or the editor.
- Fixed: operations written with an explicit block indentation indicator
  (`operation: |2`) reported diagnostics at the wrong column.
- The quickstart example now ships the demo API's schema as a local SDL file,
  so completions and checks work as soon as you open it.

## 0.1.0

First pre-release, GraphQL-first:

- `.salvo` request files with named cases and declarative expectations
- GraphQL diagnostics, completions, and hover inside the text editor,
  powered by a local SDL file, an introspection JSON file, or (opt-in)
  live introspection. No account, no cloud.
- Environments in `salvo.yaml`, secrets in VS Code `SecretStorage`
- `Salvo: Run Cases in Current File` with a per-case pass/fail report
