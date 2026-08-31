import { describe, it, expect } from 'vitest';
import { locateOperation } from '../../src/core/lang/operation-source';

// File layout (1-based lines):
// 1 salvo: 1
// 2 request:
// 3   url: "http://x.test/graphql"
// 4   operation: |
// 5     query Me {
// 6       me { id }
// 7     }
const DOC = `salvo: 1
request:
  url: "http://x.test/graphql"
  operation: |
    query Me {
      me { id }
    }
`;

describe('locateOperation', () => {
  it('extracts the operation text verbatim', () => {
    const r = locateOperation(DOC);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source.text).toBe('query Me {\n  me { id }\n}\n');
  });

  it('maps op-relative positions to 1-based file positions', () => {
    const r = locateOperation(DOC);
    if (!r.ok) throw new Error(r.reason);
    // op line 0, char 0 = 'q' of query -> file 5:5 (indent 4)
    expect(r.source.toFilePosition({ line: 0, character: 0 })).toEqual({ line: 5, col: 5 });
    // op line 1, char 2 = 'm' of me -> file 6:7
    expect(r.source.toFilePosition({ line: 1, character: 2 })).toEqual({ line: 6, col: 7 });
  });

  it('maps file positions back and rejects positions outside the body', () => {
    const r = locateOperation(DOC);
    if (!r.ok) throw new Error(r.reason);
    expect(r.source.fromFilePosition({ line: 6, col: 7 })).toEqual({ line: 1, character: 2 });
    expect(r.source.fromFilePosition({ line: 3, col: 3 })).toBeUndefined();  // above the body
    expect(r.source.fromFilePosition({ line: 6, col: 2 })).toBeUndefined();  // left of the indent
    expect(r.source.fromFilePosition({ line: 99, col: 5 })).toBeUndefined(); // past the body
  });

  it('degrades gracefully for a single-line plain scalar operation', () => {
    const r = locateOperation('salvo: 1\nrequest:\n  url: x\n  operation: "query { ok }"\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.text).toBe('query { ok }');
      const anchor = r.source.toFilePosition({ line: 0, character: 5 });
      expect(anchor.line).toBe(4);                 // anchored at the scalar, not translated
      expect(r.source.fromFilePosition({ line: 4, col: 20 })).toBeUndefined();
    }
  });

  it('fails with a reason when the operation is missing or the YAML is broken', () => {
    const missing = locateOperation('salvo: 1\nrequest:\n  url: x\n');
    expect(missing.ok).toBe(false);
    const broken = locateOperation('request: [unclosed');
    expect(broken.ok).toBe(false);
  });
});
