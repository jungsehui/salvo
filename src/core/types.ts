/** Runtime types. File-format types live in src/core/generated/ (JSON Schema is the source). */

export type Primitive = string | number | boolean | null;

/** Post-substitution, ready-to-send request. Never persisted. */
export interface ResolvedRequest {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  };
  timeoutMs: number;
}

/** Normalized HTTP outcome. `json` is undefined when the body is not valid JSON. */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>; // keys lower-cased
  bodyText: string;
  json?: unknown;
  durationMs: number;
}

export interface Assertion {
  target: string;   // e.g. 'status', 'json errors[0].extensions.code'
  expected: string; // human-readable, English
  actual: string;
  pass: boolean;
}

export type CaseOutcome = 'passed' | 'failed' | 'skipped' | 'error';

export interface RunResult {
  caseIndex: number;      // identity (architecture decision 4)
  caseName: string;       // display only
  outcome: CaseOutcome;
  assertions: Assertion[];
  response?: HttpResponse;
  error?: string;         // network error / missing secrets, English
}

export type SecretResolver = (name: string) => Promise<string | undefined>;
export type Transport = (req: ResolvedRequest) => Promise<HttpResponse>;

/**
 * A positioned problem report. `line`/`col` are 1-based positions in the
 * document the issue is ABOUT: for parse and language issues that is the
 * `.salvo` file; for schema-load issues it is the schema source file (SDL or
 * introspection JSON) named in the message — never the `.salvo` file.
 */
export interface ParseIssue {
  message: string;  // English
  line: number;     // 1-based
  col: number;      // 1-based
  severity: 'error' | 'warning';
}
