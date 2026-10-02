import { parseDocument, isSeq, isMap } from 'yaml';

type EditResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Structural, comment-preserving edits of the cases list. Like updateScalar,
 * they refuse malformed YAML instead of masking it. A new case gets empty
 * `vars` and `expect` maps so the GUI has something to edit.
 */
export function appendCase(text: string, name: string): EditResult {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, error: `Cannot edit a file with YAML errors: ${doc.errors[0]?.message ?? 'unknown'}` };
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return { ok: false, error: 'The file is not a YAML mapping.' };
  }
  const item = { name, vars: {}, expect: {} };
  const existing = doc.get('cases', true);
  if (existing === undefined) {
    doc.set('cases', doc.createNode([item]));
  } else if (isSeq(existing)) {
    existing.add(doc.createNode(item));
  } else {
    return { ok: false, error: '"cases" is not a list.' };
  }
  return { ok: true, text: doc.toString() };
}

export function removeCase(text: string, index: number): EditResult {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, error: `Cannot edit a file with YAML errors: ${doc.errors[0]?.message ?? 'unknown'}` };
  }
  const cases = doc.get('cases', true);
  if (!isSeq(cases) || !Number.isInteger(index) || index < 0 || index >= cases.items.length) {
    return { ok: false, error: `No case at index ${index}.` };
  }
  cases.delete(index);
  return { ok: true, text: doc.toString() };
}
