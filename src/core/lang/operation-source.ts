import { parseDocument, LineCounter, isScalar, Scalar } from 'yaml';

export interface OperationSource {
  text: string;
  toFilePosition(pos: { line: number; character: number }): { line: number; col: number };
  fromFilePosition(pos: { line: number; col: number }): { line: number; character: number } | undefined;
}

export function locateOperation(fileText: string):
  | { ok: true; source: OperationSource }
  | { ok: false; reason: string } {
  const lc = new LineCounter();
  const doc = parseDocument(fileText, { lineCounter: lc, keepSourceTokens: true });
  if (doc.errors.length > 0) {
    return { ok: false, reason: `YAML error: ${doc.errors[0]!.message}` };
  }
  const node = doc.getIn(['request', 'operation'], true);
  if (!isScalar(node) || typeof node.value !== 'string') {
    return { ok: false, reason: 'request.operation is missing or not a string.' };
  }
  const text = node.value;

  if (node.type !== Scalar.BLOCK_LITERAL || text.trim().length === 0) {
    // Only a non-empty literal block ('|') preserves line structure. Folded
    // blocks ('>') join lines, and single-line styles unescape - both lose the
    // correspondence - while an empty block would borrow indentation from
    // whatever sibling line follows it. Anchor those at the scalar and refuse
    // inverse mapping.
    // (yaml populates range for every node parsed without errors; the
    // doc.errors guard above makes the assertion safe.)
    const at = lc.linePos(node.range![0]);
    const anchor = { line: at.line, col: at.col };
    return {
      ok: true,
      source: { text, toFilePosition: () => anchor, fromFilePosition: () => undefined },
    };
  }

  // Block scalar: range[0] sits on the '|' header line; content starts on the
  // next line with a constant indent, so lines map one-to-one.
  const headerLine = lc.linePos(node.range![0]).line;   // 1-based
  const contentStartLine = headerLine + 1;               // file line of op line 0
  const fileLines = fileText.split('\n');
  // Relies on YAML auto-detected indentation: the first non-blank content line
  // sets the block's floor, so scanning to it cannot overshoot the block.
  let indent = 0;
  for (let l = contentStartLine - 1; l < fileLines.length; l += 1) {
    const lineText = fileLines[l]!;
    if (lineText.trim().length > 0) {
      indent = lineText.length - lineText.trimStart().length;
      break;
    }
  }
  const opLineCount = text.split('\n').length;

  return {
    ok: true,
    source: {
      text,
      toFilePosition: ({ line, character }) => ({ line: contentStartLine + line, col: indent + character + 1 }),
      fromFilePosition: ({ line, col }) => {
        const opLine = line - contentStartLine;
        const character = col - indent - 1;
        if (opLine < 0 || opLine >= opLineCount || character < 0) return undefined;
        return { line: opLine, character };
      },
    },
  };
}
