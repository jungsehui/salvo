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
  /** Fires when the environment or the schema cache changes; returns an unsubscribe function. */
  onProjectChange(listener: () => void): () => void;
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

    /** Applies one intent; true when the document actually changed. */
    const applyEdit = async (edit: FieldEdit): Promise<boolean> => {
      const result = applyFieldEdit(document.getText(), edit);
      if (!result.ok) {
        post({ type: 'notice', level: 'error', message: result.error });
        return false;
      }
      if (!result.replace) return false;
      const we = new vscode.WorkspaceEdit();
      we.replace(
        document.uri,
        new vscode.Range(document.positionAt(result.replace.start), document.positionAt(result.replace.end)),
        result.replace.text
      );
      guard.markOwn(result.text);
      if (!(await vscode.workspace.applyEdit(we))) {
        post({ type: 'notice', level: 'error', message: 'The edit could not be applied.' });
        return false;
      }
      // The echo guard swallows the change event of our own edit, so push the
      // new snapshot here. Without it an added or removed case never reaches
      // the panel that asked for it (ruling 2026-10-02).
      await pushState();
      return true;
    };

    // Edits run one at a time, each computed from the text the previous one
    // produced: a double-clicked "Add case" must not compute twice from the
    // same text and then apply at stale offsets (ruling 2026-10-02).
    let editQueue: Promise<unknown> = Promise.resolve();
    const enqueueEdit = (edit: FieldEdit): Promise<boolean> => {
      const next = editQueue.then(() => applyEdit(edit));
      editQueue = next.catch(() => undefined);
      return next;
    };

    const onMessage = async (raw: unknown): Promise<void> => {
      if (!isWebviewMessage(raw)) return;
      switch (raw.type) {
        case 'ready':
          return pushState();
        case 'edit':
          await enqueueEdit({ kind: 'scalar', path: raw.path, value: raw.value });
          return;
        case 'editOperation':
          await enqueueEdit({ kind: 'operation', text: raw.text });
          return;
        case 'setMethod':
          await enqueueEdit({ kind: 'method', method: raw.method });
          return;
        case 'editJsonBody':
          await enqueueEdit({ kind: 'jsonBody', text: raw.text });
          return;
        case 'appendCase':
          await enqueueEdit({ kind: 'appendCase', name: raw.name });
          return;
        case 'removeCase':
          if (this.services.runStore.get(key)?.running) {
            post({ type: 'notice', level: 'info', message: 'Wait for the run to finish before removing a case.' });
            return;
          }
          // Results are keyed by case index and a removal shifts every later
          // case, so drop this document's results before the edit lands.
          this.services.runStore.clear(key);
          await enqueueEdit({ kind: 'removeCase', index: raw.index });
          return;
        case 'run':
          // A blur-commit followed by a Run click arrives as two messages: let
          // the queued edits land first, without putting the run itself in the
          // queue (a long run must not hold later edits back).
          await editQueue;
          return this.services.run(document, raw.selected);
        case 'selectEnvironment':
          await this.services.setEnvironment(document, raw.name);
          return; // onProjectChange pushes to every panel, this one included
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
      panel.webview.onDidReceiveMessage((m: unknown) => {
        onMessage(m).catch((e: unknown) =>
          post({ type: 'notice', level: 'error', message: `Salvo: ${e instanceof Error ? e.message : String(e)}` })
        );
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== key) return;
        if (guard.isEcho(e.document.getText())) return; // our own WorkspaceEdit (decision 9.2)
        void pushState();
      }),
      { dispose: this.services.runStore.onChange((changed) => changed === key && void pushState()) },
      { dispose: this.services.onProjectChange(() => void pushState()) },
    ];
    panel.onDidDispose(() => {
      disposed = true;
      for (const s of subscriptions) s.dispose();
    });
  }
}
