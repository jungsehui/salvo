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
