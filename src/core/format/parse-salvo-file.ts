import { parseDocument, LineCounter } from 'yaml';
import Ajv, { type ErrorObject } from 'ajv';
import type { SalvoFile } from '../generated/salvo-file';
import type { ParseIssue } from '../types';
import { isGraphqlRequest } from '../../shared/request-kind';
import fileSchema from '../../../schemas/salvo-file.schema.json';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

// The schema declares `request` as oneOf GraphqlRequest | HttpRequest, and ajv
// then reports both branches plus "must match exactly one schema". The branches
// are exclusive on `operation`, so validate against the branch the document
// chose and report only its errors (spec section 3). The copies drop `$id`
// because one Ajv instance cannot hold two schemas with the same id.
const { $id: _schemaId, ...schemaBody } = fileSchema;
const forBranch = (ref: string) =>
  ajv.compile<SalvoFile>({ ...schemaBody, properties: { ...schemaBody.properties, request: { $ref: ref } } } as object);
const validateGraphql = forBranch('#/definitions/graphqlRequest');
const validateHttp = forBranch('#/definitions/httpRequest');

/** RFC 6901: '~1' -> '/', then '~0' -> '~'. */
function decodePointerSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export type ParseFileResult =
  | { ok: true; file: SalvoFile; issues: ParseIssue[] }
  | { ok: false; issues: ParseIssue[] };

/** A request object without `operation` is an HTTP request (spec section 1). */
function choosesHttp(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const request = (data as { request?: unknown }).request;
  return typeof request === 'object' && request !== null && !Array.isArray(request) && !Object.hasOwn(request, 'operation');
}

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
  const validate = choosesHttp(data) ? validateHttp : validateGraphql;

  if (!validate(data)) {
    for (const err of validate.errors ?? []) {
      issues.push({ message: formatAjvError(err), ...nodePos(doc, lc, err.instancePath), severity: 'error' });
    }
    return { ok: false, issues };
  }

  const file = data as SalvoFile;

  const ruleIssues = requestRuleIssues(file, doc, lc);
  if (ruleIssues.length > 0) return { ok: false, issues: ruleIssues };

  if (isGraphqlRequest(file.request) && file.request.operation.includes('{{')) {
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

/** Rules the schema cannot word clearly (spec section 1, "Rules the parser enforces"). */
function requestRuleIssues(file: SalvoFile, doc: ReturnType<typeof parseDocument>, lc: LineCounter): ParseIssue[] {
  const req = file.request;
  const at = (path: string, message: string): ParseIssue => ({ message, ...nodePos(doc, lc, path), severity: 'error' });
  const out: ParseIssue[] = [];

  if (isGraphqlRequest(req)) {
    for (const key of ['body', 'query', 'auth'] as const) {
      if (Object.hasOwn(req, key)) {
        out.push(at(`/request/${key}`, `request.${key} is for HTTP requests; a GraphQL request sends its operation as the body.`));
      }
    }
    return out;
  }

  for (const key of ['variables', 'operationName'] as const) {
    if (Object.hasOwn(req, key)) {
      out.push(at(`/request/${key}`, `request.${key} is for GraphQL requests; this request has no operation, so it is an HTTP request.`));
    }
  }
  if (req.body !== undefined) {
    const body = req.body;
    const kinds = (['json', 'text', 'form'] as const).filter((k) => Object.hasOwn(body, k));
    if (kinds.length !== 1) out.push(at('/request/body', 'request.body must contain exactly one of json, text, form.'));
    const method = req.method ?? 'GET';
    if (method === 'GET' || method === 'HEAD') {
      out.push(at('/request/body', `A ${method} request cannot have a body. Set request.method (for example POST) or remove request.body.`));
    }
  }
  if (req.auth !== undefined && Object.keys(req.headers ?? {}).some((h) => h.toLowerCase() === 'authorization')) {
    out.push(at('/request/auth', 'Use either request.auth or an authorization header, not both.'));
  }
  return out;
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath
    ? '/' + err.instancePath.split('/').filter(Boolean).map(decodePointerSegment).join('/')
    : '/';
  // Name the allowed values: "must be equal to one of the allowed values" alone does not tell a user that `get` should be `GET`.
  const allowed = err.keyword === 'enum' ? (err.params as { allowedValues?: unknown[] }).allowedValues : undefined;
  return `${path} ${err.message ?? 'is invalid'}${allowed ? `: ${allowed.join(', ')}` : ''}`;
}

function nodePos(doc: ReturnType<typeof parseDocument>, lc: LineCounter, instancePath: string): { line: number; col: number } {
  const path = instancePath.split('/').filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : decodePointerSegment(s)));
  // yaml's getIn with keepScalar returns the node; its range[0] is the value's start offset.
  const node = path.length ? (doc.getIn(path, true) as { range?: [number, number, number] } | undefined) : undefined;
  const offset = node?.range?.[0] ?? 0;
  return lc.linePos(offset);
}
