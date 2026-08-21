import { parseDocument, LineCounter } from 'yaml';
import Ajv, { type ErrorObject } from 'ajv';
import type { SalvoManifest } from '../generated/salvo-manifest';
import type { ParseIssue } from '../types';
import manifestSchema from '../../../schemas/salvo-manifest.schema.json';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile<SalvoManifest>(manifestSchema as object);

export type ParseManifestResult =
  | { ok: true; manifest: SalvoManifest; issues: ParseIssue[] }
  | { ok: false; issues: ParseIssue[] };

export function parseManifest(text: string): ParseManifestResult {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });

  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((e) => {
        const { line, col } = lc.linePos(e.pos[0]);
        return { message: e.message, line, col, severity: 'error' as const };
      }),
    };
  }

  const data = doc.toJS();
  if (!validate(data)) {
    return {
      ok: false,
      issues: (validate.errors ?? []).map((err: ErrorObject) => ({
        message: `${err.instancePath || '/'} ${err.message ?? 'is invalid'}${err.keyword === 'required' ? ` (${JSON.stringify(err.params)})` : ''}`,
        line: 1,
        col: 1,
        severity: 'error' as const,
      })),
    };
  }

  return { ok: true, manifest: data as SalvoManifest, issues: [] };
}
