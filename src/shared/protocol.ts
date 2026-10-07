import type { SalvoFile } from '../core/generated/salvo-file';
import type { ParseIssue, RunResult } from '../core/types';
import { isHttpMethod, type HttpMethod } from './request-kind';

/**
 * Types shared by the extension host, the core, and the webview. This file
 * must stay dependency-free: the webview bundle imports it, so it takes only
 * type imports from core and host, and runtime imports only from sibling
 * shared modules (enforced by the purity guard).
 */

/** 0-based position inside an operation text (CodeMirror's coordinate space). */
export interface TextPosition {
  line: number;
  character: number;
}

export interface LangDiagnostic {
  message: string;
  start: TextPosition;
  end: TextPosition;
  severity: 'error' | 'warning';
}

export interface LangCompletion {
  label: string;
  detail?: string;
  documentation?: string;
}

/** Path into the parsed file, e.g. ['cases', 0, 'vars', 'token']. */
export type FieldPath = (string | number)[];

export type DocumentView =
  | { ok: true; file: SalvoFile; issues: ParseIssue[] }
  | { ok: false; issues: ParseIssue[] };

export type SchemaStatus = 'none' | 'loading' | 'ready' | 'failed';

/** Everything the webview renders. The host pushes a whole snapshot on every change (decision 8: the webview owns nothing). */
export interface EditorSnapshot {
  view: DocumentView;
  envName?: string;
  envNames: string[];
  schema: SchemaStatus;
  results?: RunResult[];
  running: boolean;
}

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'edit'; path: FieldPath; value: string }
  | { type: 'editOperation'; text: string }
  | { type: 'appendCase'; name: string }
  | { type: 'removeCase'; index: number }
  | { type: 'run'; selected: number[] | 'all' }
  | { type: 'selectEnvironment'; name: string }
  | { type: 'lang'; id: number; op: 'complete' | 'hover'; text: string; pos: TextPosition }
  | { type: 'lang'; id: number; op: 'lint'; text: string }
  | { type: 'setMethod'; method: HttpMethod }
  | { type: 'editJsonBody'; text: string };

export type HostToWebview =
  | { type: 'state'; snapshot: EditorSnapshot }
  | { type: 'langResult'; id: number; op: 'complete'; items: LangCompletion[] }
  | { type: 'langResult'; id: number; op: 'lint'; items: LangDiagnostic[] }
  | { type: 'langResult'; id: number; op: 'hover'; text?: string }
  | { type: 'notice'; level: 'error' | 'info'; message: string };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isIndex = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isPos = (x: unknown): x is TextPosition => isRecord(x) && isIndex(x['line']) && isIndex(x['character']);
const isPath = (x: unknown): x is FieldPath =>
  Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === 'string' || isIndex(s));

/** The webview is untrusted input: validate shape before acting on a message. */
export function isWebviewMessage(x: unknown): x is WebviewToHost {
  if (!isRecord(x) || typeof x['type'] !== 'string') return false;
  switch (x['type']) {
    case 'ready':
      return true;
    case 'edit':
      return isPath(x['path']) && typeof x['value'] === 'string';
    case 'editOperation':
      return typeof x['text'] === 'string';
    case 'appendCase':
    case 'selectEnvironment':
      return typeof x['name'] === 'string';
    case 'removeCase':
      return isIndex(x['index']);
    case 'run':
      return x['selected'] === 'all' || (Array.isArray(x['selected']) && x['selected'].every(isIndex));
    case 'lang': {
      if (!Number.isInteger(x['id']) || typeof x['text'] !== 'string') return false;
      if (x['op'] === 'lint') return true;
      return (x['op'] === 'complete' || x['op'] === 'hover') && isPos(x['pos']);
    }
    case 'setMethod':
      return isHttpMethod(x['method']);
    case 'editJsonBody':
      return typeof x['text'] === 'string';
    default:
      return false;
  }
}
