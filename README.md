# Salvo

A file-first API client for VS Code where **one request carries many named cases**.

> **Status: pre-release 0.1.x on the Marketplace.**
> `.salvo` files work in two editors: the plain text editor (GraphQL
> diagnostics, completions, hover) and the visual editor (request form,
> cases, runs, responses). Environments, secrets, and case runs are shared
> between them. See the
> [roadmap](https://github.com/jungsehui/salvo/blob/main/.claude/roadmap.md)
> for what v0.1 does and does not contain.

## The problem

Every API client gives you **environments**: `local`, `dev`, `prod`. That axis answers
*where do I send this?*

None of them give you the other axis: *what do I send?*

Take one authenticated endpoint. You need to check four things every time you touch it:

| Case | Expected |
|---|---|
| valid token | `200` |
| expired token | `UNAUTHENTICATED` |
| token without permission | `FORBIDDEN` |
| no token | `UNAUTHENTICATED` |

Those four are **one unit of verification**, but no tool models them as one. Your options are:

- **Duplicate the request four times.** Now the query body lives in four places and drifts.
- **Attach a CSV to a collection runner.** Now rows have no names and no per-row expectations.

Both are workarounds, not expressions.

## The idea

One file. One query body. Many named cases with their own expectations.

```yaml
# login.salvo
request:
  method: POST
  url: "{{baseUrl}}/graphql"
  operation: |
    query Me { me { id name } }

cases:
  - name: valid token
    vars: { token: "{{secret:VALID_TOKEN}}" }
    expect: { status: 200, "data.me.id": { exists: true } }

  - name: expired token
    vars: { token: "{{secret:EXPIRED_TOKEN}}" }
    expect: { "errors[0].extensions.code": "UNAUTHENTICATED" }

  - name: no permission
    vars: { token: "{{secret:NOPERM_TOKEN}}" }
    expect: { "errors[0].extensions.code": "FORBIDDEN" }

  - name: no token
    vars: { token: "" }
    expect: { "errors[0].extensions.code": "UNAUTHENTICATED" }
```

Run it and all four fire together, each scored against its own expectation.
Change the resolver, change the query in **one** place.

That is what the name means. A salvo is a volley fired at once.

## GraphQL without a live server

Most GraphQL tooling reads your schema by **introspection**, which means it needs a
reachable server with introspection enabled. Production servers should not have it enabled
([OWASP recommends disabling it](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html)),
and plenty of teams disable it in every environment.

Salvo reads the schema from a **local SDL file** instead, the kind your build already emits
(`autoSchemaFile`, `graphql-codegen`, `rover graph introspect > schema.graphql`). Introspection
over HTTP stays available as an opt-in, never as the default.

Autocomplete, hover, validation, and go-to-definition come from
[`graphql-language-service`](https://github.com/graphql/graphiql/tree/main/packages/graphql-language-service),
the GraphQL Foundation's own implementation, called as plain functions. No language server
process, no `graphql-config` requirement.

Measured on a 246KB federated SDL with 852 types:

| Operation | cold | median |
|---|---|---|
| `buildSchema` (validating) | 20.3ms | 13.9ms |
| autocomplete at query root (200 suggestions) | 1.8ms | <0.1ms |
| diagnostics on an invalid query | 6.2ms | - |

## What it will not do

Saying no is part of the design. Each of these is a deliberate exclusion with a reason.

| Not doing | Why |
|---|---|
| **Tunneling / exposing localhost** | There is no stable VS Code API for it. `Tunnel` and `openTunnel` do not appear in `vscode.d.ts`; `asExternalUri` is documented as "a no-op if the extension is running on the client machine"; proposed APIs cannot be published to the Marketplace. Use VS Code's built-in **Ports** view instead. |
| **Accounts, login, cloud sync** | Your requests are files. Git is the sync layer. |
| **Telemetry** | Not "off by default". Absent. |
| **JavaScript pre/post-request scripting** | Sandboxing, timeouts, and the security surface cost more than declarative assertions are worth. Request chaining covers the real cases. |
| **Performance traces, field usage stats** | Those need a server plugin or a hosted registry. That is observability, not an editor tool. |
| **A schema registry** | Git already does this. |

## Visual editor

Right-click a `.salvo` file → **Open With → Salvo Editor**, click the
preview button in the editor title, or run `Salvo: Open Visual Editor`.
Three panels: the request (URL, headers, operation), the cases (add,
remove, run one, run all), and the selected case's response with its
assertions. The operation editor completes and validates against your
schema. Every edit is written back into the same text document as a
minimal change, so `git diff` stays readable and the text editor can stay
open next to it.

## Design

| Decision | Choice |
|---|---|
| Requests live in | `.salvo` files (YAML + a published JSON Schema), committed to your repo |
| Secrets live in | `SecretStorage` only. Files hold `{{secret:NAME}}` references, never values |
| Network calls run in | The extension host, never the webview (CORS applies to `vscode-webview://` origins; the host also inherits VS Code's proxy support automatically) |
| Editor surface | `CustomTextEditorProvider` with `priority: "option"`, so VS Code handles dirty state, save, undo, and hot exit, and the raw text stays one click away |

Full write-up in [`.claude/architecture.md`](https://github.com/jungsehui/salvo/blob/main/.claude/architecture.md).

## Roadmap

| Milestone | Scope |
|---|---|
| **v0.1** | GraphQL execution, local SDL schema, autocomplete, environment × case model, declarative assertions, secrets |
| v0.2 | Visual query builder, schema documentation panel, operation history |
| v0.3 | Full HTTP surface (all methods, six body types, five auth schemes), `.http` import |
| v0.4 | Collection runner, request chaining |
| v1.0 | Stabilization, docs, performance |
| later | gRPC |

## Prior art

Salvo exists because of gaps in tools worth respecting, not because they are bad.

- **[Bruno](https://www.usebruno.com/)** is the closest thing to this and the honest benchmark. MIT, no login, file-based, and its VS Code extension already loads SDL files. If you want a general API client today, use it.
- **[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)** got file-first right years ago. Salvo will import its `.http` files.
- **[GraphQL: Language Feature Support](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql)** is excellent as a language server and deliberately does not execute anything. Salvo builds on the library underneath it.

## Development

Requires **Node 20+** (`@vscode/vsce` declares `engines.node >= 20`).

```bash
npm install
npm run check      # tsc --noEmit
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

[MIT](LICENSE)
