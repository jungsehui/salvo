import { describe, it, expect } from 'vitest';
import { appendCase, removeCase } from '../../src/core/format/edit-structure';
import { parseSalvoFile } from '../../src/core/format/parse-salvo-file';

const DOC = `salvo: 1
request:
  url: "http://x"
  operation: |
    query { ok }
# cases below
cases:
  - name: first   # keep
    vars: { a: 1 }
  - name: second
`;

const names = (text: string): string[] | undefined => {
  const parsed = parseSalvoFile(text);
  return parsed.ok ? parsed.file.cases?.map((c) => c.name) : undefined;
};

describe('appendCase', () => {
  it('appends a case with empty vars and expect, preserving comments', () => {
    const r = appendCase(DOC, 'third');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('# cases below');
    expect(r.text).toContain('# keep');
    expect(names(r.text)).toEqual(['first', 'second', 'third']);
    const parsed = parseSalvoFile(r.text);
    expect(parsed.ok && parsed.file.cases?.[2]).toEqual({ name: 'third', vars: {}, expect: {} });
  });

  it('creates the cases list when the file has none', () => {
    const r = appendCase('salvo: 1\nrequest:\n  url: "http://x"\n  operation: "query { ok }"\n', 'only');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = parseSalvoFile(r.text);
    expect(parsed.ok && parsed.file.cases).toEqual([{ name: 'only', vars: {}, expect: {} }]);
  });

  it('refuses malformed YAML and a non-list cases key', () => {
    expect(appendCase('cases: [unclosed', 'x').ok).toBe(false);
    expect(appendCase('salvo: 1\ncases: nope\n', 'x').ok).toBe(false);
  });

  it('refuses a document whose top level is not a mapping', () => {
    expect(appendCase('sal', 'x').ok).toBe(false);
    expect(appendCase('- a\n', 'x').ok).toBe(false);
  });
});

describe('removeCase', () => {
  it('removes the case at an index and keeps the others in order', () => {
    const r = removeCase(DOC, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(names(r.text)).toEqual(['second']);
    expect(r.text).toContain('# cases below');
  });

  it('rejects out-of-range or non-integer indexes', () => {
    expect(removeCase(DOC, 5).ok).toBe(false);
    expect(removeCase(DOC, -1).ok).toBe(false);
    expect(removeCase(DOC, 0.5).ok).toBe(false);
    expect(removeCase('salvo: 1\n', 0).ok).toBe(false);
  });
});
