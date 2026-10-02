import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, hoverTooltip, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintKeymap, type Diagnostic } from '@codemirror/lint';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { TextPosition } from '../shared/protocol';
import type { Bridge } from './bridge';
import { graphqlLanguage } from './graphql-stream';

export interface OperationEditorProps {
  text: string;
  bridge: Bridge;
  nonce: string;
  schemaReady: boolean;
  onCommit: (text: string) => void;
}

const toPosition = (state: EditorState, offset: number): TextPosition => {
  const line = state.doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
};

const toOffset = (state: EditorState, pos: TextPosition): number => {
  const line = state.doc.line(Math.min(Math.max(pos.line + 1, 1), state.doc.lines));
  return Math.min(line.from + pos.character, line.to);
};

/**
 * CodeMirror 6 operation editor. Every language answer comes from the host
 * over the bridge (decision 1: only UI runs here); the editor is created once
 * and receives later `text` values through a document replacement.
 */
export function OperationEditor({ text, bridge, nonce, schemaReady, onCommit }: OperationEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | undefined>(undefined);
  // Callbacks and flags read at event time; a ref keeps the extensions stable across renders.
  const latest = useRef({ text, bridge, schemaReady, onCommit });
  latest.current = { text, bridge, schemaReady, onCommit };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const complete = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
      if (!latest.current.schemaReady) return null;
      const word = ctx.matchBefore(/[_A-Za-z0-9]*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const items = await latest.current.bridge.complete(ctx.state.doc.toString(), toPosition(ctx.state, ctx.pos));
      return {
        from: word.from,
        options: items.map((i) => ({ label: i.label, detail: i.detail, info: i.documentation })),
        validFor: /^[_A-Za-z0-9]*$/,
      };
    };

    const lint = async (v: EditorView): Promise<Diagnostic[]> => {
      if (!latest.current.schemaReady) return [];
      const items = await latest.current.bridge.lint(v.state.doc.toString());
      return items.map((d) => {
        const from = toOffset(v.state, d.start);
        return { from, to: Math.max(from, toOffset(v.state, d.end)), severity: d.severity, message: d.message };
      });
    };

    const hover = hoverTooltip(async (v, pos) => {
      if (!latest.current.schemaReady) return null;
      const info = await latest.current.bridge.hover(v.state.doc.toString(), toPosition(v.state, pos));
      if (!info) return null;
      return {
        pos,
        create: () => {
          const dom = document.createElement('pre');
          dom.className = 'hover';
          dom.textContent = info;
          return { dom };
        },
      };
    });

    const extensions: Extension[] = [
      EditorView.cspNonce.of(nonce),
      lineNumbers(),
      history(),
      graphqlLanguage,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({ override: [complete] }),
      linter(lint, { delay: 400 }),
      hover,
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
      placeholder('query { ... }'),
      EditorView.domEventHandlers({
        blur: (_event, v) => {
          const current = v.state.doc.toString();
          if (current !== latest.current.text) latest.current.onCommit(current);
        },
      }),
      EditorView.theme({
        '&': { backgroundColor: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' },
        '.cm-content': { fontFamily: 'var(--vscode-editor-font-family)' },
        '.cm-gutters': {
          backgroundColor: 'var(--vscode-editorGutter-background)',
          color: 'var(--vscode-editorLineNumber-foreground)',
          border: 'none',
        },
      }),
    ];

    const v = new EditorView({ state: EditorState.create({ doc: latest.current.text, extensions }), parent });
    view.current = v;
    return () => {
      v.destroy();
      view.current = undefined;
    };
  }, [nonce]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== text) v.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }, [text]);

  return <div ref={host} className="operation-editor" />;
}
