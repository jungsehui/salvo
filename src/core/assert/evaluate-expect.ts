import type { Expect } from '../generated/salvo-file';
import type { Assertion, HttpResponse } from '../types';
import { evaluateMatcher } from './matchers';
import { getAtPath } from './json-path';

export function evaluateExpect(expect: Expect | undefined, response: HttpResponse): Assertion[] {
  const out: Assertion[] = [];

  for (const [name, spec] of Object.entries(expect?.headers ?? {})) {
    const value = response.headers[name.toLowerCase()];
    const r = evaluateMatcher(spec, { found: value !== undefined, value });
    out.push({ target: `header ${name}`, ...r });
  }

  for (const [path, spec] of Object.entries(expect?.json ?? {})) {
    if (response.json === undefined) {
      out.push({ target: `json ${path}`, pass: false, expected: 'a JSON body', actual: 'response body is not valid JSON' });
      continue;
    }
    const lookup = getAtPath(response.json, path);
    if (!lookup.ok) {
      out.push({ target: `json ${path}`, pass: false, expected: 'a valid path', actual: lookup.error });
      continue;
    }
    const r = evaluateMatcher(spec, lookup);
    out.push({ target: `json ${path}`, ...r });
  }

  const status = expect?.status ?? '2xx';
  // Status goes last so content assertions surface first in results.
  out.push(statusAssertion(status, response.status));

  return out;
}

function statusAssertion(expected: number | string, actual: number): Assertion {
  const pass =
    typeof expected === 'number' ? actual === expected : Math.floor(actual / 100) === Number(expected[0]);
  return { target: 'status', pass, expected: String(expected), actual: String(actual) };
}
