import { parseDocument } from 'yaml';

export function updateScalar(
  text: string,
  path: (string | number)[],
  value: string | number | boolean
): { ok: true; text: string } | { ok: false; error: string } {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, error: `Cannot edit a file with YAML errors: ${doc.errors[0]?.message ?? 'unknown'}` };
  }
  if (!doc.hasIn(path)) {
    return { ok: false, error: `No value at path ${JSON.stringify(path)}` };
  }
  if (doc.getIn(path) === value) {
    return { ok: true, text }; // untouched: byte-identical output
  }
  doc.setIn(path, value);
  return { ok: true, text: doc.toString() };
}
