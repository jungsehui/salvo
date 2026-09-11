import type { RunResult } from '../types';

export const REDACTED = '<redacted>';
/** Shorter values would blank unrelated text ("200", "ok"); they are left alone and documented as such. */
export const MIN_REDACT_LENGTH = 4;

const qualifying = (values: readonly string[]): string[] =>
  // Longest first, so a secret that contains another leaves no fragment behind.
  values.filter((v) => v.length >= MIN_REDACT_LENGTH).sort((a, b) => b.length - a.length);

export function redactText(text: string, values: readonly string[]): string {
  let out = text;
  for (const v of qualifying(values)) out = out.split(v).join(REDACTED);
  return out;
}

function redactUnknown(value: unknown, values: readonly string[]): unknown {
  if (typeof value === 'string') return redactText(value, values);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v, values));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactUnknown(v, values)]));
  }
  return value;
}

/** Copies of the results with every secret value replaced; inputs are never mutated. */
export function redactResults(results: RunResult[], values: readonly string[]): RunResult[] {
  const active = qualifying(values);
  if (active.length === 0) return results;
  return results.map((r) => ({
    ...r,
    ...(r.error !== undefined ? { error: redactText(r.error, active) } : {}),
    assertions: r.assertions.map((a) => ({ ...a, expected: redactText(a.expected, active), actual: redactText(a.actual, active) })),
    ...(r.response
      ? {
          response: {
            ...r.response,
            headers: Object.fromEntries(Object.entries(r.response.headers).map(([k, v]) => [k, redactText(v, active)])),
            bodyText: redactText(r.response.bodyText, active),
            ...(r.response.json !== undefined ? { json: redactUnknown(r.response.json, active) } : {}),
          },
        }
      : {}),
  }));
}
