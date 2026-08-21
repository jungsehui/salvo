# Quickstart

Two files, no accounts, no company setup:

- `salvo.yaml` names an environment (`demo`) and its variables.
- `countries.salvo` is one request with two named cases, each with its own
  variables and expectations, run as one volley against the public
  [Countries GraphQL API](https://countries.trevorblades.com).

Until the VS Code editor lands (plan 3), you can exercise the same flow
programmatically; `tests/core/end-to-end.test.ts` does exactly this against
a local fixture server.
