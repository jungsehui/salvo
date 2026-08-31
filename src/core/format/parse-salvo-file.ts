import { parseDocument, LineCounter } from 'yaml';
import Ajv, { type ErrorObject } from 'ajv';
import type { SalvoFile } from '../generated/salvo-file';
import type { ParseIssue } from '../types';
import fileSchema from '../../../schemas/salvo-file.schema.json';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile<SalvoFile>(fileSchema as object);

/** RFC 6901: '~1' -> '/', then '~0' -> '~'. */
function decodePointerSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export type ParseFileResult =
  | { ok: true; file: SalvoFile; issues: ParseIssue[] }
  | { ok: false; issues: ParseIssue[] };

export function parseSalvoFile(text: string): ParseFileResult {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, keepSourceTokens: true });

  if (doc.errors.length > 0) {
    const issues = doc.errors.map((e): ParseIssue => {
      const { line, col } = lc.linePos(e.pos[0]);
      return { message: e.message, line, col, severity: 'error' };
    });
    return { ok: false, issues };
  }

  const data = doc.toJS();
  const issues: ParseIssue[] = [];

  if (!validate(data)) {
    for (const err of validate.errors ?? []) {
      issues.push({ message: formatAjvError(err), ...nodePos(doc, lc, err.instancePath), severity: 'error' });
    }
    return { ok: false, issues };
  }

  const file = data as SalvoFile;

  if (file.request.operation.includes('{{')) {
    issues.push({
      message: 'The operation body must not contain {{...}} placeholders; use GraphQL variables instead.',
      ...nodePos(doc, lc, '/request/operation'),
      severity: 'warning',
    });
  }

  const seen = new Map<string, number>();
  (file.cases ?? []).forEach((c, i) => {
    const first = seen.get(c.name);
    if (first !== undefined) {
      issues.push({
        message: `Duplicate case name "${c.name}" (cases ${first} and ${i}). Case identity is the index; names should be unique for readability.`,
        ...nodePos(doc, lc, `/cases/${i}/name`),
        severity: 'warning',
      });
    } else {
      seen.set(c.name, i);
    }
  });

  return { ok: true, file, issues };
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath
    ? '/' + err.instancePath.split('/').filter(Boolean).map(decodePointerSegment).join('/')
    : '/';
  return `${path} ${err.message ?? 'is invalid'}`;
}

function nodePos(doc: ReturnType<typeof parseDocument>, lc: LineCounter, instancePath: string): { line: number; col: number } {
  const path = instancePath.split('/').filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : decodePointerSegment(s)));
  // yaml's getIn with keepScalar returns the node; its range[0] is the value's start offset.
  const node = path.length ? (doc.getIn(path, true) as { range?: [number, number, number] } | undefined) : undefined;
  const offset = node?.range?.[0] ?? 0;
  return lc.linePos(offset);
}
