import { parseDocument } from 'yaml';
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

function nextText(text: string, edit: FieldEdit): { ok: true; text: string } | { ok: false; error: string } {
  switch (edit.kind) {
    case 'scalar': {
      // Gate on YAML errors only; the GUI is already read-only while the file fails the schema (decision 9.3), so this is a backstop for racing edits.
      const doc = parseDocument(text);
      if (doc.errors.length > 0) return { ok: false, error: UNPARSABLE };
      const current = doc.getIn(edit.path);
      const value = coerceLike(current, edit.value);
      if (typeof value === 'string' && (typeof current === 'number' || typeof current === 'boolean')) {
        const kind = typeof current === 'number' ? 'a number' : 'true or false';
        return { ok: false, error: `${edit.path.join('.')} holds ${kind}. Enter ${kind}, or change its type in the text editor.` };
      }
      return updateScalar(text, edit.path, value);
    }
    case 'operation': {
      // Gate on YAML errors only; the GUI is already read-only while the file fails the schema (decision 9.3), so this is a backstop for racing edits.
      const doc = parseDocument(text);
      if (doc.errors.length > 0) return { ok: false, error: UNPARSABLE };
      const current = doc.getIn(['request', 'operation']);
      // A clip-chomped block ('|') ends with '\n'; keep it so the style survives the rewrite (decision 9.5).
      const value = typeof current === 'string' && current.endsWith('\n') && !edit.text.endsWith('\n') ? `${edit.text}\n` : edit.text;
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
  // The form never turns a valid file invalid: the GUI would then show a stale
  // model while edits land on the live text (decision 9.3).
  if (parseSalvoFile(text).ok) {
    const after = parseSalvoFile(next.text);
    if (!after.ok) {
      return { ok: false, error: `This change would make the file invalid: ${after.issues[0]?.message ?? 'unknown error'}` };
    }
  }
  // yaml emits LF; a CRLF document keeps its line endings so the edit stays one small range.
  const out = text.includes('\r\n') ? next.text.replace(/\r?\n/g, '\r\n') : next.text;
  const replace = minimalTextEdit(text, out);
  return replace ? { ok: true, text: out, replace } : { ok: true, text };
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
