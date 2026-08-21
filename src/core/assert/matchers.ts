import type { Matcher } from '../generated/salvo-file';

const show = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v));

export function evaluateMatcher(
  spec: Matcher,
  lookup: { found: boolean; value?: unknown }
): { pass: boolean; expected: string; actual: string } {
  const { found } = lookup;
  const value = lookup.value;
  const actual = found ? show(value) : 'absent';

  if (spec === null || typeof spec !== 'object') {
    return { pass: found && value === spec, expected: `equals ${show(spec)}`, actual };
  }

  if ('exists' in spec && spec.exists !== undefined) {
    return { pass: found === spec.exists, expected: spec.exists ? 'exists' : 'does not exist', actual: found ? 'present' : 'absent' };
  }
  if ('contains' in spec && spec.contains !== undefined) {
    const expected = `contains ${show(spec.contains)}`;
    if (!found) return { pass: false, expected, actual };
    if (typeof value === 'string') return { pass: value.includes(spec.contains), expected, actual };
    if (Array.isArray(value)) return { pass: value.includes(spec.contains), expected, actual };
    return { pass: false, expected, actual: `${actual} (not a string or array)` };
  }
  if ('matches' in spec && spec.matches !== undefined) {
    const expected = `matches /${spec.matches}/`;
    if (!found || typeof value !== 'string') return { pass: false, expected, actual: found ? `${actual} (not a string)` : actual };
    let re: RegExp;
    try {
      re = new RegExp(spec.matches);
    } catch {
      return { pass: false, expected, actual: `invalid pattern ${show(spec.matches)}` };
    }
    return { pass: re.test(value), expected, actual };
  }
  if ('oneOf' in spec && spec.oneOf !== undefined) {
    return { pass: found && spec.oneOf.some((x) => x === value), expected: `one of ${show(spec.oneOf)}`, actual };
  }
  if ('length' in spec && spec.length !== undefined) {
    const expected = `length ${spec.length}`;
    const len = typeof value === 'string' || Array.isArray(value) ? value.length : undefined;
    if (!found || len === undefined) return { pass: false, expected, actual: found ? `${actual} (not a string or array)` : actual };
    return { pass: len === spec.length, expected, actual: `length ${len}` };
  }
  return { pass: false, expected: 'a known matcher', actual: `unsupported matcher ${show(spec)}` };
}
