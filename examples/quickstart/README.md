# Quickstart

Three files, no accounts, no company setup:

- `salvo.yaml` names an environment (`demo`) and its variables.
- `countries.salvo` is one request with two named cases, each with its own
  variables and expectations, run as one volley against the public
  [Countries GraphQL API](https://countries.trevorblades.com).
- `countries.graphql` is the API's schema as a local SDL file, so completions,
  hover, and checks work without asking the server (taken from
  [trevorblades/countries](https://github.com/trevorblades/countries), MIT).

Open `countries.salvo`, then **Salvo: Open Visual Editor** (or the preview
button in the editor title) and press **Run all cases**. The same two cases
also run from `Salvo: Run Cases in Current File` in the text editor.
