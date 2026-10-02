# Changelog

## 0.1.1 (unreleased)

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
- Saving with Cmd/Ctrl+S or switching away from the editor commits the field
  you are typing in.
- Run results are redacted: every resolved secret value of four or more
  characters is replaced wherever it appears verbatim, before it reaches the
  report or the editor.
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
