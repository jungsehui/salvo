/**
 * Types shared by the extension host, the core, and the webview. This file
 * must stay dependency-free: the webview bundle imports it, and the purity
 * guard forbids anything but type imports here.
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
