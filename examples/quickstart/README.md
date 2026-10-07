# Quickstart

Five files, no accounts, no company setup:

- `salvo.yaml` names an environment (`demo`) and its variables.
- `countries.salvo` is one request with two named cases, each with its own
  variables and expectations, run as one volley against the public
  [Countries GraphQL API](https://countries.trevorblades.com).
- `countries.graphql` is the API's schema as a local SDL file, so completions,
  hover, and checks work without asking the server (taken from
  [trevorblades/countries](https://github.com/trevorblades/countries), MIT).
- `httpbin-bearer.salvo` and `httpbin-basic.salvo` are REST examples: one
  endpoint checked with several tokens or passwords at once, against the
  public [httpbin.org](https://httpbin.org) test service. It is a third-party
  service; if it is down, these two files fail while the rest still works.

Open `countries.salvo`, then **Salvo: Open Visual Editor** (or the preview
button in the editor title) and press **Run all cases**. The same two cases
also run from `Salvo: Run Cases in Current File` in the text editor.
