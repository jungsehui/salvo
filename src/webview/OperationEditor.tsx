import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, Transaction, type Extension } from '@codemirror/state';
import { EditorView, hoverTooltip, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintKeymap, type Diagnostic } from '@codemirror/lint';
import { syntaxHighlighting } from '@codemirror/language';
import type { TextPosition } from '../shared/protocol';
import type { Bridge } from './bridge';
import { graphqlHighlightStyle, graphqlLanguage } from './graphql-stream';

/** Dispatched when the schema state changes, so the linter re-runs without a document change. */
const schemaChanged = StateEffect.define<null>();

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
      // `$` is part of the variable label the host returns; `@` is not part of directive labels.
      const word = ctx.matchBefore(/\$?[_A-Za-z0-9]*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const items = await latest.current.bridge.complete(ctx.state.doc.toString(), toPosition(ctx.state, ctx.pos));
      return {
        from: word.from,
        options: items.map((i) => ({ label: i.label, detail: i.detail, info: i.documentation })),
        validFor: /^\$?[_A-Za-z0-9]*$/,
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
      syntaxHighlighting(graphqlHighlightStyle),
      autocompletion({ override: [complete] }),
      linter(lint, {
        delay: 400,
        needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(schemaChanged))),
      }),
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
        '.cm-content': {
          fontFamily: 'var(--vscode-editor-font-family)',
          caretColor: 'var(--vscode-editorCursor-foreground, var(--vscode-editor-foreground))',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--vscode-editorGutter-background)',
          color: 'var(--vscode-editorLineNumber-foreground)',
          border: 'none',
        },
        '.cm-tooltip': {
          backgroundColor: 'var(--vscode-editorHoverWidget-background)',
          color: 'var(--vscode-editorHoverWidget-foreground)',
          border: '1px solid var(--vscode-editorHoverWidget-border, transparent)',
        },
        '.cm-tooltip.cm-tooltip-autocomplete': {
          backgroundColor: 'var(--vscode-editorSuggestWidget-background)',
          color: 'var(--vscode-editorSuggestWidget-foreground)',
          border: '1px solid var(--vscode-editorSuggestWidget-border, transparent)',
        },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: 'var(--vscode-editorSuggestWidget-selectedBackground)',
          color: 'var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-editorSuggestWidget-foreground))',
        },
        // CodeMirror draws lint squiggles as data: SVG backgrounds, which the
        // CSP blocks (img-src); draw them with text-decoration instead.
        '.cm-lintRange-error': {
          backgroundImage: 'none',
          textDecoration: 'underline wavy var(--vscode-editorError-foreground, #f14c4c)',
          textDecorationSkipInk: 'none',
        },
        '.cm-lintRange-warning': {
          backgroundImage: 'none',
          textDecoration: 'underline wavy var(--vscode-editorWarning-foreground, #cca700)',
          textDecorationSkipInk: 'none',
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

  // The linter only re-arms on document changes; a schema that becomes ready (or fails)
  // after mount must refresh the squiggles (or clear them). `needsRefresh` on the linter
  // re-arms it when this effect arrives; `lint` returns [] while the schema is not ready.
  useEffect(() => {
    view.current?.dispatch({ effects: schemaChanged.of(null) });
  }, [schemaReady]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    // External text stays out of undo history: Ctrl+Z must not restore the pre-external
    // text, because the next blur would then commit it and silently revert the host's edit.
    if (current !== text) {
      v.dispatch({
        changes: { from: 0, to: current.length, insert: text },
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [text]);

  return <div ref={host} className="operation-editor" />;
}
