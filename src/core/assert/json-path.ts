export function parsePath(path: string): { ok: true; segments: (string | number)[] } | { ok: false; error: string } {
  const segments: (string | number)[] = [];
  let i = 0;
  const err = (msg: string) => ({ ok: false as const, error: `Invalid path "${path}" at offset ${i}: ${msg}` });

  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      i += 1;
      if (i >= path.length) return err('trailing "."');
    } else if (ch === '[') {
      const close = path.indexOf(']', i);
      if (close === -1) return err('unclosed "["');
      const inner = path.slice(i + 1, close);
      if (/^\d+$/.test(inner)) {
        segments.push(Number(inner));
      } else if (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
        segments.push(inner.slice(1, -1));
      } else {
        return err('brackets must hold an index or a "quoted" key');
      }
      i = close + 1;
    } else {
      let j = i;
      while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
      const ident = path.slice(i, j);
      if (ident.length === 0) return err('empty segment');
      segments.push(ident);
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
      if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !(seg in cur)) {
        return { ok: true, found: false };
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return { ok: true, found: true, value: cur };
}
