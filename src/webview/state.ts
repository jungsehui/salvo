import type { DocumentView, EditorSnapshot, HostToWebview } from '../shared/protocol';

export type GoodView = Extract<DocumentView, { ok: true }>;

export interface WebviewState {
  snapshot?: EditorSnapshot;
  /** Last snapshot whose document parsed; rendered while the text is mid-edit and broken (decision 9.3). */
  lastGood?: GoodView;
  banner?: string;
  notice?: { level: 'error' | 'info'; message: string };
  selectedCase: number;
}

export const initialState: WebviewState = { selectedCase: 0 };

export function reduce(state: WebviewState, msg: HostToWebview): WebviewState {
  switch (msg.type) {
    case 'state': {
      const { view } = msg.snapshot;
      if (view.ok) {
        const count = view.file.cases?.length ?? 0;
        return {
          ...state,
          snapshot: msg.snapshot,
          lastGood: view,
          banner: undefined,
          selectedCase: Math.min(state.selectedCase, Math.max(0, count - 1)),
        };
      }
      const first = view.issues[0];
      return { ...state, snapshot: msg.snapshot, banner: first ? `Line ${first.line}: ${first.message}` : 'The file cannot be parsed.' };
    }
    case 'notice':
      return { ...state, notice: { level: msg.level, message: msg.message } };
    case 'langResult':
      return state;
  }
}

export function selectCase(state: WebviewState, index: number): WebviewState {
  return { ...state, selectedCase: index };
}

export function dismissNotice(state: WebviewState): WebviewState {
  return { ...state, notice: undefined };
}

/** What the panels render: the live model when it parses, else the last good one. */
export function modelOf(state: WebviewState): GoodView | undefined {
  const view = state.snapshot?.view;
  return view?.ok ? view : state.lastGood;
}
