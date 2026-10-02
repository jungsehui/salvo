import { parseSalvoFile } from '../core/format/parse-salvo-file';
import { updateScalar } from '../core/format/update-scalar';
import { appendCase, removeCase } from '../core/format/edit-structure';
import { minimalTextEdit, type TextReplace } from '../core/format/minimal-edit';
import type { DocumentView, FieldPath } from '../shared/protocol';

export type FieldEdit =
  | { kind: 'scalar'; path: FieldPath; value: string }
  | { kind: 'operation'; text: string }
  | { kind: 'appendCase'; name: string }
  | { kind: 'removeCase'; index: number };

export type ApplyResult = { ok: true; text: string; replace?: TextReplace } | { ok: false; error: string };

const UNPARSABLE = 'Fix the errors in the file before editing it here.';

export function buildDocumentView(text: string): DocumentView {
  const parsed = parseSalvoFile(text);
  return parsed.ok ? { ok: true, file: parsed.file, issues: parsed.issues } : { ok: false, issues: parsed.issues };
}

/** Form fields arrive as strings; keep the type the document already has (updateScalar compares strictly). */
export function coerceLike(current: unknown, raw: string): string | number | boolean {
  if (typeof current === 'number') {
    const trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  if (typeof current === 'boolean' && (raw === 'true' || raw === 'false')) return raw === 'true';
  return raw;
}

function valueAt(root: unknown, path: FieldPath): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function nextText(text: string, edit: FieldEdit): { ok: true; text: string } | { ok: false; error: string } {
  switch (edit.kind) {
    case 'scalar': {
      const parsed = parseSalvoFile(text);
      if (!parsed.ok) return { ok: false, error: UNPARSABLE };
      return updateScalar(text, edit.path, coerceLike(valueAt(parsed.file, edit.path), edit.value));
    }
    case 'operation': {
      const parsed = parseSalvoFile(text);
      if (!parsed.ok) return { ok: false, error: UNPARSABLE };
      // A clip-chomped block ('|') ends with '\n'; keep it so the style survives the rewrite (decision 9.5).
      const current = parsed.file.request.operation;
      const value = current.endsWith('\n') && !edit.text.endsWith('\n') ? `${edit.text}\n` : edit.text;
      return updateScalar(text, ['request', 'operation'], value);
    }
    case 'appendCase':
      return appendCase(text, edit.name);
    case 'removeCase':
      return removeCase(text, edit.index);
  }
}

/**
 * New text plus the smallest range replacement that produces it (decision
 * 9.1); `replace` is absent for a no-op. The range is minimal against yaml's
 * re-serialization, which normalizes comment spacing to one space: a file
 * with wider spacing sees that folded into its first edit, once.
 */
export function applyFieldEdit(text: string, edit: FieldEdit): ApplyResult {
  const next = nextText(text, edit);
  if (!next.ok) return next;
  const replace = minimalTextEdit(text, next.text);
  return replace ? { ok: true, text: next.text, replace } : { ok: true, text };
}

/** Suppresses the change event our own WorkspaceEdit produces (decision 9.2). Text equality, not counters: it cannot drift. */
export class EchoGuard {
  private pending: string | undefined;

  markOwn(text: string): void {
    this.pending = text;
  }

  /** True exactly once for the text we last wrote; any other text is a foreign change and clears the mark. */
  isEcho(text: string): boolean {
    const match = this.pending !== undefined && this.pending === text;
    this.pending = undefined;
    return match;
  }
}
