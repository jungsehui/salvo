export function parsePath(path: string): { ok: true; segments: (string | number)[] } | { ok: false; error: string } {
  const segments: (string | number)[] = [];
  let i = 0;
  const err = (msg: string) => ({ ok: false as const, error: `Invalid path "${path}" at offset ${i}: ${msg}` });

  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      if (segments.length === 0) return err('leading "."');
      i += 1;
      const next = path[i];
      if (next === undefined) return err('trailing "."');
      if (next === '.') return err('empty segment');
      if (next === '[') return err('"." must be followed by a key, not "["');
    } else if (ch === '[') {
      if (path[i + 1] === '"') {
        // Quote-aware scan so keys containing "]" parse correctly.
        const closeQuote = path.indexOf('"', i + 2);
        if (closeQuote === -1) return err('unclosed quote');
        if (path[closeQuote + 1] !== ']') return err('expected "]" after quoted key');
        segments.push(path.slice(i + 2, closeQuote));
        i = closeQuote + 2;
      } else {
        const close = path.indexOf(']', i);
        if (close === -1) return err('unclosed "["');
        const inner = path.slice(i + 1, close);
        if (!/^\d+$/.test(inner)) return err('brackets must hold an index or a "quoted" key');
        segments.push(Number(inner));
        i = close + 1;
      }
    } else {
      let j = i;
      while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
      segments.push(path.slice(i, j));
      i = j;
    }
  }
  if (segments.length === 0) return err('empty path');
  return { ok: true, segments };
}

export function getAtPath(
  root: unknown,
  path: string
): { ok: true; found: boolean; value?: unknown } | { ok: false; error: string } {
  const parsed = parsePath(path);
  if (!parsed.ok) return parsed;

  let cur: unknown = root;
  for (const seg of parsed.segments) {
    if (typeof seg === 'number') {
      if (!Array.isArray(cur) || seg >= cur.length) return { ok: true, found: false };
      cur = cur[seg];
    } else {
      // Own properties only: 'constructor' on a plain object must be absent.
      if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !Object.prototype.hasOwnProperty.call(cur, seg)) {
        return { ok: true, found: false };
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return { ok: true, found: true, value: cur };
}
