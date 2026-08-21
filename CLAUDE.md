# CLAUDE.md: Salvo

Auto-loaded entry point for any Claude Code session in this repo. Keep it under
60 lines. Detail lives in `.claude/`.

## Project at a glance

VS Code extension: a file-first API client where a single request carries
multiple named **cases** (valid token / expired / forbidden / none) that run as
one salvo and assert declaratively. GraphQL is a first-class citizen and works
against servers with introspection **disabled**, by reading a local SDL file.

- **Status**: planning only. No code yet. Plan written 2026-08-21.
- **Marketplace ID**: `jungsehui.salvo` (publisher fixed, do not rename).
- **License**: MIT.
- **Target**: `engines.vscode`는 사용 API의 최소 버전으로 착수 시 확정
  (조사 기준 stable은 1.134였으나 그것을 요구할 이유는 없다. Bruno는 ^1.80).
  Node 20+ 빌드 / macOS first.

## The one-sentence pitch

> Postman/Bruno give you environments. Salvo gives you environments **and**
> cases, in a file you commit, with a GraphQL schema that does not need a live
> server.

## Where to look first

| Need | Read |
|---|---|
| Why does this exist? Is the differentiator real? | `.claude/research.md` |
| What are the module boundaries, where does state live? | `.claude/architecture.md` |
| What patterns must I follow? Anti-patterns? | `.claude/conventions.md` |
| What ships in v0.1, what is deliberately excluded? | `.claude/roadmap.md` |
| What is the current state, what is next? | `.claude/handoff/` (latest dated file) |

## Hard rules

1. **Network calls happen in the extension host, never in the webview.** The
   webview origin is `vscode-webview://<hash>`, so CORS applies to arbitrary
   API servers. The extension host is Node, has no CORS, and gets proxy
   support for free (`http.proxySupport` defaults to `override`).
2. **Never use a proposed API.** `vsce` refuses to publish extensions that
   declare `enabledApiProposals`, and the `product.json` allowlist that would
   enable them only exists in Microsoft's private builds.
3. **Secrets go to `SecretStorage`, never to a file or `globalState`.**
   `globalState` and `workspaceState` are plaintext. `SecretStorage` has no
   workspace scope, so compose the key yourself.
4. **Introspection is not a fallback path, it is an opt-in extra.** The
   primary schema source is a local SDL file. Linkareer's servers hardcode
   `introspection: false` with no `NODE_ENV` branch.
5. **No account, no login, no telemetry.** Not "off by default". Absent.
   This is a stated differentiator, see `.claude/research.md`.

## Slash commands

Not yet defined. Mirror `custom-intellij-nav`'s `/ship`, `/release`,
`/docs-sync` once there is code to ship.
